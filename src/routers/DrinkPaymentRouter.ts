import { Context } from "koa";

// Import base route class
import { CustomRouter } from "./CustomRouter";

// Defines the routes used at the index of the application
export class DrinkPaymentRouter extends CustomRouter
{
    // Implement the route creating method
    protected CreateRoutes(): void
    {
        this.router.get('/buyDrink', async (ctx: Context): Promise<any> =>
        {

        });
    }
}