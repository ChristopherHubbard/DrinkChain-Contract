import { Context } from "koa";
import { SPSP } from 'ilp/src';
import { configure, payment } from 'paypal-rest-sdk';

// Import base route class
import { CustomRouter } from "./CustomRouter";
import { SPSPServer } from '../paymentReceivers';
import { orderService } from "../services";

// Import the drink config file
const { assetScale, actionsAndPrices } = require('../config/pricing.json');
const { paymentPointer } = require('../config/payments.json');

const drinks: Map<string, number> = new Map<string, number>(Object.entries(actionsAndPrices));

// Set the locals -- is there a better way to manage the paymentTimeout and currentData?
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
                const orderHash: string = orderService.createData(action, infoFields);

                // This does not give the correct hash!!
                spsp = await SPSPServer.run(!spsp, orderService.order);
    
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

            const orderHash: string = orderService.createData(action, infoFields);

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
                    description: `Payment to paypal for ${host} action(s) on order ${orderHash}`
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
                        const res: any = await orderService.order(orderHash, Number(total), 'paypal');

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
}