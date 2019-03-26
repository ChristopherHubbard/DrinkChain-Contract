import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';
import { SPSP, createPlugin } from 'ilp/src';
import { configure, payment } from 'paypal-rest-sdk';
import { createHash } from 'crypto';

// Import base route class
import { OrderData } from '../models';
import { CustomRouter } from "./CustomRouter";
import { SPSPServer } from '../paymentReceivers';

// Import the drink config file
const drinks: Map<string, number> = new Map<string, number>(Object.entries(require('../config/pricing.json').actionsAndPrices));
const assetScale: number = require('../config/pricing.json').assetScale;
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const deviceURL: string = require('../config/deviceConnection.json').deviceURL;
const paymentPointer: string = require('../config/hostSPSP.json').paymentPointer;

// Set up a hash -> orderData map for managing the order information without timeout
// What to use for hash? -- Order numb
const orderMap: Map<string, OrderData> = new Map<string, OrderData>();

// Set the locals -- is there a better way to manage the paymentTimeout and currentData?
const paymentTimeout: number = 30 * 10000;
let spsp: string;

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
        this.router.post('/interledger/create-payment', async (ctx: any, next: Function): Promise<any> =>
        {
            // Check if the data is set -- should be unset on timeout
            const { action } = JSON.parse(ctx.request.body.body);
            const infoFields = JSON.parse(JSON.parse(ctx.request.body.body).infoFields);

            try
            {
                // Query to make sure the hosts paymentPointer is available
                await SPSP.query(paymentPointer);

                // Create the order hash
                const orderHash: string = this.createData(action, infoFields);

                // This does not give the correct hash!!
                spsp = await SPSPServer.run(!spsp, this.order);
    
                // Send the invoice back -- needed for the resolution with payment-request client side
                ctx.body = {
                    paymentPointer: spsp,
                    orderHash: orderHash
                };
                ctx.status = 200;
            }
            catch (error)
            {
                ctx.throw(error);
            }
        });

        // This is the route for creating a Paypal payment
        this.router.post('/paypal/create-payment', async (ctx: any, next: Function): Promise<any> =>
        {
            // Extract the hostname of this contract
            const { host } = ctx;

            // Extract the payment total?
            const { action } = JSON.parse(ctx.request.body.body);
            const infoFields = JSON.parse(JSON.parse(ctx.request.body.body).infoFields);

            const orderHash: string = this.createData(action, infoFields);

            // This should work as long as the orderHash call didnt fail
            const amount: number = (drinks.get(action) as number) * Math.pow(10, assetScale);

            const create_payment_json: any = {
                intent: 'sale',
                payer: {
                    payment_method: 'paypal'
                },
                redirect_urls: {
                    return_url: `https://${host}/paypal/execute-payment`, // This return URL is what its going to call for execute... WTF
                    cancel_url: 'https://iotsharenet.com/home/order' // This is where to go on paypal cancel -- is this right?
                },
                transactions: [{
                    amount: {
                        currency: 'USD',
                        total: amount.toString()
                    },
                    description: `Payment for ${(orderMap.get(orderHash) as OrderData).action}`
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

        // This is the route for executing a paypal payment -- how to make sure currentData is set for PayPal payments?
        this.router.get('/paypal/execute-payment', async (ctx: Context, next: Function): Promise<any> =>
        {
            // Will this let me pass in the orderHash?
            const { paymentId, PayerID, orderHash } = ctx.request.query;
            const payerId: payment.ExecuteRequest = {
                payer_id: PayerID
            };

            await new Promise((resolve, reject): void =>
            {
                payment.execute(paymentId, payerId, async (error, payment): Promise<any> => 
                {
                    // How to make sure current data is set at this point?
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
                        const res: any = await this.order(orderHash, Number(total), 'paypal');

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

    private createData(action: string, infoFields: any): string
    {
        if (drinks.get(action) !== undefined)
        {
            // Set the data and create the timeout -- how long?
            const currentData: OrderData = {
                action: action,
                infoFields: new Map<string, string>(Object.entries(infoFields)),
                date: new Date()
            };

            // This orderHash needs to be set in ILP to let callback know the order
            const currentDataHash: string = createHash('sha256')
                                                .update(JSON.stringify(currentData), 'utf8')
                                                .digest('hex');

            // Add the orderData to the map?
            orderMap.set(currentDataHash, currentData);

            // Set the timeout to remove the data
            setTimeout(() =>
            {
                // Delete the orderData from the map
                orderMap.delete(currentDataHash);
            }, paymentTimeout);

            return currentDataHash;
        }
        else
        {
            // What to do on a failure?
            console.error('Error creating the payment data')
            return '';
        }
    }

    private async order(orderHash: string, amount: number, method: string): Promise<any>
    {
        // Send the request to the bar -- use the currently set data
        if (typeof orderMap.get(orderHash) !== undefined)
        {
            const { action, infoFields } = orderMap.get(orderHash) as OrderData;
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

                // Remove the data
                orderMap.delete(orderHash);
            }
            catch (error)
            {
                // There was some error sending to the bar
                console.error('Error on order!');
            }
        }
        else
        {
            // Return error
            console.error('Data not found!');
        }
    }
}