import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';
import { SPSP, createPlugin } from 'ilp/src';
import { configure, payment } from 'paypal-rest-sdk';

// Import base route class
import { OrderData } from '../models';
import { CustomRouter } from "./CustomRouter";
import { SPSPServer } from '../paymentReceivers';
import { resolve } from "dns";

// Import the drink config file
const drinks: Map<string, number> = new Map<string, number>(Object.entries(require('../config/pricing.json').actionsAndPrices));
const assetScale: number = require('../config/pricing.json').assetScale;
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const deviceURL: string = require('../config/deviceConnection.json').deviceURL;
const paymentPointer: string = require('../config/hostSPSP.json').paymentPointer;

// Set the locals -- is there a better way to manage the paymentTimeout and currentData?
const paymentTimeout: number = 30 * 1000;
let currentData: OrderData | undefined;
let spsp: string;
let currentTimeout: NodeJS.Timeout;

// Configure Paypal -- can set this dynamically to live?
configure({
    mode: 'sandbox',
    client_id: process.env.PAYPAL_CLIENT_ID as string || 'AetavAfUQfYBB4B_tCDsLv_JZj_RJhkf_74stpk7P77JHLcROG0B0Kj8J9R15cT0yC360RbxzwGgvjUh',
    client_secret: process.env.PAYPAL_SECRET as string || 'EHe8yukQLsaKxoSVttge1FBFmDeoLlfyTkHW2mYGThfVLGJyMiYWO8oWXGGUGIKRRftsd2Xrh_s2Qsc_'
});

export class DrinkPaymentRouter extends CustomRouter
{
    public constructor(title: string, prefix?: string)
    {
        super(title, prefix);

        // Create the routes -- will call the implemented method
        this.CreateRoutes();
    }

    // Implement the route creating method
    protected CreateRoutes(): void
    {
        this.router.get('/invoice', async (ctx: Context, next: Function): Promise<any> =>
        {
            try
            {
                // Query to make sure the hosts paymentPointer is available
                await SPSP.query(paymentPointer);
                if (!spsp)
                {
                    spsp = await SPSPServer.run(this.order);
                }
    
                // Send the invoice back -- needed for the resolution with payment-request client side
                ctx.body = {
                    paymentPointer: spsp
                };
                ctx.status = 200;
            }
            catch (error)
            {
                ctx.throw(error);
            }
        });

        // Endpoint to set the data
        this.router.post('/setData', async (ctx: any, next: Function): Promise<any> =>
        {
            // Check if the data is set -- should be unset on timeout
            const { action } = JSON.parse(ctx.request.body.body);
            const infoFields = JSON.parse(JSON.parse(ctx.request.body.body).infoFields);

            if (typeof currentData !== undefined && drinks.get(action) !== undefined)
            {
                // Set the data and create the timeout -- how long?
                currentData = <OrderData> {
                    action: action,
                    infoFields: new Map<string, string>(Object.entries(infoFields))
                };

                // Set the timeout to remove the data
                currentTimeout = setTimeout(() =>
                {
                    // Set the currentData to undefined
                    currentData = undefined;
                }, paymentTimeout);

                ctx.body = {
                    success: true
                };
                ctx.status = 200;
            }
            else
            {
                ctx.body = {
                    success: false
                };
                ctx.status = 503;
            }
        });

        // This is the route for creating a Paypal payment
        this.router.post('/paypal/create-payment/', async (ctx: Context, next: Function): Promise<any> =>
        {
            const create_payment_json: any = {
                intent: 'sale',
                payer: {
                    payment_method: 'paypal'
                },
                redirect_urls: {
                    return_url: 'https://iotsharenet.com',
                    cancel_url: 'https://iotsharenet.com'
                },
                transactions: [{
                    amount: {
                        currency: 'USD',
                        total: '1.0'
                    },
                    'description':'This is the payment description.'
                }]
            };

            // Some next level async BS
            await new Promise((resolve, reject): void =>
            {
                payment.create(create_payment_json, (error, payment): any =>
                {
                    // Dumbass callback crap -- try to emulate a try-catch with if-else
                    if (error)
                    {
                        ctx.body = {
                            success: false
                        };
                        ctx.status = 500;
                        console.error(error);
                        reject();
                    }
                    else
                    {
                        // Will want to redirect the user to the approve_url -- how does this call execute?
                        // Need it to call my endpoint, not PayPals
                        ctx.body = {
                            payment_info: payment
                        };
                        ctx.status = 200;
                        console.log(payment);
                        resolve();
                    }
                })
            });
        });

        // This is the route for executing a paypal payment
        this.router.get('/paypal/execute-payment', async (ctx: Context, next: Function): Promise<any> =>
        {
            const { paymentId, PayerID } = ctx.request.query;
            const payerId: any = {
                payer_id: PayerID
            };

            await new Promise((resolve, reject): void =>
            {
                payment.execute(paymentId, payerId, async (error, payment): Promise<any> => 
                {
                    if (error)
                    {
                        console.error(error);
                        reject();
                    }
                    else if (payment.state === 'approved')
                    {
                        const { total } = payment.transactions[0].amount
                        console.log('Payment completed successfully');

                        // Call order -- should be successful -- what amount to send?
                        const res: any = await this.order(Number(total), 'paypal');

                        console.log(res);
                        resolve();
                    }
                    else
                    {
                        console.error('Payment not successful');
                        reject();
                    }
                });
            });
        });
    }

    private async order(amount: number, method: string): Promise<any>
    {
        // Send the request to the bar -- use the currently set data
        if (typeof currentData !== undefined)
        {
            const { action, infoFields } = currentData as OrderData;
            if (Number(amount) < (drinks.get(action) as number) * Math.pow(10, assetScale))
            {
                // Amount is not paid in full -- currently only full payments are supported, since refunds fail
                console.error('Action was not paid for in full!');
                throw new Error('500 error');
            }

            // Send the payment to the owner's SPSP pointer -- should still be available since query
            if (method === 'interledger')
            {
                await SPSP.pay(createPlugin(), {
                    receiver: paymentPointer,
                    sourceAmount: Number(amount)
                });
            }

            const requestOptions: any =
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                params: {
                    ingredients: actionsRequirements.get(action),
                    destination: infoFields.get('destination number')
                }
            };

            try
            {
                const res: AxiosResponse = await axios.get(`${deviceURL}/order`, requestOptions);

                // How to process the response?
                console.log('Successful order!');

                // Clear the timeout and remove the data
                clearTimeout(currentTimeout);
                currentData = undefined;
            }
            catch (error)
            {
                // There was some error sending to the bar
                console.log('Error on order!');
                throw error;
            }
        }
        else
        {
            throw new Error('500 Error');
        }
    }
}