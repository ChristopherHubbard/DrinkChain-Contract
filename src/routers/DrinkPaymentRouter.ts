import { Context } from "koa";

// Import base route class
import { CustomRouter } from "./CustomRouter";

const Ilp: any = require('koa-ilp');
const plugin: any = require('ilp-plugin')();

// Import the drink config file
const drinks: Map<string, number> = require('../config/pricing.json').drinksAndPrices;

// Defines the routes used at the index of the application
export class DrinkPaymentRouter extends CustomRouter
{
    private ilp: any;

    public constructor(title: string, prefix?: string)
    {
        super(title, prefix);
        this.ilp = new Ilp({ plugin });

        // Create the routes -- will call the implemented method
        this.CreateRoutes();
    }

    private pricingFunction(ctx: Context, next: Function)
    {
        // Check if the ctx has drinks -- just get the price of the first one to create ilp fields, then modify
        const drink: string = ctx.request.query.drink;
        return drinks.get(drink);
    }

    // Implement the route creating method
    protected CreateRoutes(): void
    {
        // Options route which returns info needed for payment
        this.router.options('/drinks', this.ilp.options({ }), async (ctx: Context, next: Function): Promise<any> =>
        {
            await next();
        });

        // Request to buy the drink -- should be a paid middleware and pass the request along to the device
        this.router.get('/drink', this.ilp.paid({ price: this.pricingFunction }), async (ctx: Context, next: Function): Promise<any> =>
        {
            // Send the request to buy
        });
    }
}