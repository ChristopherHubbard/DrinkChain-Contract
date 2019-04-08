import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';

// Import base route class
import { CustomRouter } from "./CustomRouter";
import { paymentService } from "../services";

// Import the config files for this bar
const { baseAsset, assetScale, actionsAndPrices } = require('../config/pricing.json');
const { deviceURL } = require('../config/deviceConnection.json');
const { supportedMethods, paymentPointer } = require('../config/payments.json');

// Create some locals
const infoFields: Array<string> = new Array<string>(require('../config/infoFields.json').infoFields);
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const drinks: Map<string, number> = new Map<string, number>(Object.entries(actionsAndPrices));

export class ContractInfoRouter extends CustomRouter
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
        this.router.get('/actions', async (ctx: Context): Promise<any> =>
        {
            try
            {
                // Set the saved drinks as the response -- should be an env variable
                ctx.body = {
                    actions: Array.from(drinks.keys())
                };
                ctx.status = 200;
            }
            catch (error)
            {
                console.error(error);
                ctx.status = 404;
            }
        });

        this.router.get('/info', async (ctx: Context): Promise<any> =>
        {
            // Get the prices for this item and the baseCurrency of this contract
            try
            {
                ctx.body = {
                    infoFields: infoFields
                };
            }
            catch (error)
            {
                console.error(error);
                ctx.status = 404;
            }
        });

        this.router.get('/priceInfo', async (ctx: Context): Promise<any> =>
        {
            // Retrieve the pricing info for this selected action
            try
            {
                const { action, clientAsset, clientPaymentPointer } = ctx.request.query;
                const price: number = drinks.get(action) as number;

                // Check for the base currency -- should work but routing issue??
                // Make this work with USD

                // Connect the plugin -- may not need this but this is indicative of the moneyd connection process in Codius
                const exchangeRate: number = await paymentService.exchangeRate(clientAsset, clientPaymentPointer, baseAsset, paymentPointer);
                if (exchangeRate < 0)
                {
                    throw new Error('No exchange rate could be found. Check your SPSP configuration.');
                }

                // Get the real price
                ctx.body = {
                    priceInfo: {
                        price: price * exchangeRate,
                        baseCurrency: clientAsset
                    }
                };
                ctx.status = 200;
            }
            catch (error)
            {
                console.error(error);
                ctx.status = 500;
                ctx.body = {
                    error: error.toString()
                }
            }
        });

        this.router.get('/paymentMethods', async (ctx: Context): Promise<any> =>
        {
            // Get the accepted payment methods by this contract
            try
            {
                ctx.body = {
                    supportedMethods: supportedMethods
                };
                ctx.status = 200;
            }
            catch (error)
            {
                console.error(error);
                ctx.status = 500;
                ctx.body = {
                    error: error
                };
            }
        });

        this.router.get('/canOrder', async (ctx: Context): Promise<any> => 
        {
            // Check the cup quantity first
            const requestOptions: any =
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };

            // This is just for testing -- remove soon!
            ctx.body = {
                canOrder: true
            };
            ctx.status = 200;
            return ctx;

            // Try to get the current cup quantity -- check that this works with koas pipeline
            const res: AxiosResponse = await axios.get(`${deviceURL}/cups`, requestOptions);
            if (!res || res.data < 1)
            {
                ctx.body = {
                    canOrder: false
                }
                return ctx;
            }

             // Send a request for the drink -- request should be supplied with the drink name (whiskey, vodka, coke) (not mixes)
             const action: string = ctx.request.query.action;
             const drink: any = actionsRequirements.get(action);

             // Now query the device for the quantities of each ingredient in the drink
             for (let ingredient of Object.getOwnPropertyNames(drink))
             {
                 // Options for the get to the micro -- pass the ingredient
                 const requestOptions: any =
                 {
                     method: 'GET',
                     headers: { 'Content-Type': 'application/json' },
                     params: {
                         ingredient: ingredient
                     }
                 };
 
                 try
                 {
                     // Request info on this ingredients quantity from device
                     const res: AxiosResponse = await axios.get(`${deviceURL}/quantity`, requestOptions);
 
                     // Get the response data and check for true
                     const drinkQuantity: number = res.data;
                     const requiredQuantity: number = drink[ingredient] || Infinity;
 
                     if (drinkQuantity < requiredQuantity)
                     {
                        ctx.body = {
                            canOrder: false
                        };
                        return ctx;
                     }
                 }
                 catch (error)
                 {
                     console.error(error);

                     ctx.body = {
                         canOrder: false
                     };
                     return ctx;
                 }
             }
 
             // Return whether this drink can be made -- include which ingredients are out
             ctx.body = {
                 canOrder: true
             };
             ctx.status = 200;
        });

        this.router.get('/health', async (ctx: Context, next: Function) =>
        {
            // Check the health of the device -- health checks of this contract will be held on the client or server!
            try
            {
                const requestOptions: any =
                {
                    method: 'OPTIONS',
                    headers: { 'Content-Type': 'application/json' }
                };
                
                // Send options requests for the device endpoints -- this insures they exist!
                const [cupResponse, quantityResponse, orderResponse]: Array<AxiosResponse> = await Promise.all([
                    (axios as any).options(`${deviceURL}/cups`, requestOptions),
                    (axios as any).options(`${deviceURL}/quantity`, requestOptions),
                    (axios as any).options(`${deviceURL}/order`, requestOptions)
                ]);

                // If here then all requests succeeded
                ctx.body = {
                    healthy: true
                };
                ctx.status = 200;
            }
            catch (error)
            {
                ctx.body = {
                    healthy: false
                };

                // Still a successful request yeah?
                ctx.status = 200;
            }
        });
    }
}