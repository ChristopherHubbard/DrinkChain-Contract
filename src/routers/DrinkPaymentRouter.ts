import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';
import { SPSP, createPlugin } from 'ilp';

// Import base route class
import { OrderData } from '../models';
import { CustomRouter } from "./CustomRouter";
import SPSPServer from '../SPSPServer';

// Import the drink config file
const drinks: Map<string, number> = new Map<string, number>(Object.entries(require('../config/pricing.json').actionsAndPrices));
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const deviceURL: string = require('../config/deviceConnection.json').deviceURL;
const paymentPointer: string = require('../config/hostSPSP.json').paymentPointer;

// Set the locals
const paymentTimeout: number = 30 * 1000;
let currentData: OrderData | undefined;
let spsp: string;
let currentTimeout: NodeJS.Timeout;

export class DrinkPaymentRouter extends CustomRouter
{
    public constructor(title: string, prefix?: string)
    {
        super(title, prefix);

        // Create the routes -- will call the implemented method
        this.CreateRoutes();
    }

    private async endPointValidation(ctx: Context, next: Function)
    {
        // Check that the request came from the localhost? -- otherwise this is a client error
        if (ctx.host !== 'localhost:8080')
        {
            ctx.status = 400;
            return ctx;
        }
        await next();
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
                    spsp = await SPSPServer();
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

        this.router.post('/order', this.endPointValidation, async (ctx: any, next: Function): Promise<any> =>
        {
            // Send the request to the bar -- use the currently set data
            const { amount } = JSON.parse(ctx.request.body.body);
            if (typeof currentData !== undefined)
            {
                const { amount } = JSON.parse(ctx.request.body.body);
                const { action, infoFields } = currentData as OrderData;
                if (Number(amount) < (drinks.get(action) as number))
                {
                    // Amount is not paid in full -- currently only full payments are supported, since refunds fail
                    console.error('Action was not paid for in full!');
                    ctx.status = 500;
                    return ctx;
                }

                // Send the payment to the owner's SPSP pointer -- should still be available since query
                await SPSP.pay(createPlugin(), {
                    receiver: paymentPointer,
                    sourceAmount: (drinks.get(action) as number).toString()
                });

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

                    ctx.status = 200;
                }
                catch (error)
                {
                    // There was some error sending to the bar
                    console.log('Error on order!');
                    ctx.status = 500;
                }
            }
            else
            {
                ctx.status = 500;
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
    }
}