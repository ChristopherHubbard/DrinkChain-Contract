import { Context } from "koa";
import axios, { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios';

// Import base route class
import { CustomRouter } from "./CustomRouter";
import { Drink, Ingredient } from "../models";

// Defines the routes used at the index of the application
export class DeviceInformationRouter extends CustomRouter
{
    // Implement the route creating method
    protected CreateRoutes(): void
    {
        this.router.get('/drinks', async (ctx: Context): Promise<any> =>
        {
            // Request the drink list from the device -- mixes/straight up
            // Should be stored on the device as a map<string, map<string, int>>
            const requestOptions: any =
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };

            try
            {
                let res: AxiosResponse = await axios.get('', requestOptions);

                // Parse the drinks response -- need to know response schema from device
                let drinks: any = res.data;
                ctx.response.body = {
                    drinks: drinks
                };
            }
            catch
            {
                console.error("Cannot retrieve drink options");
                ctx.status = 404;
            }
        });

        this.router.get('/cups', async (ctx: Context): Promise<any> =>
        {
            // Get the current quantity of cups available from the device
            const requestOptions: any =
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };

            // Try to get the current cup quantity
            try
            {
                let res: AxiosResponse = await axios.get('', requestOptions);

                ctx.response.body = {
                    cupQuantity: res.data.quantity
                };
            }
            catch
            {
                console.error("Cannot retrieve cup quantity");
                ctx.status = 404;
            }
        });

        this.router.get('/canMakeDrink', async (ctx: Context): Promise<any> =>
        {
            // Send a request for the drink -- request should be supplied with the drink name (whiskey, vodka, coke) (not mixes)
            let drink: Drink = ctx.request.query;

            // Now query the device for the quantities of each ingredient in the drink
            let drinkCreationMap: Map<Ingredient, boolean> = new Map<Ingredient, boolean>();
            let canMakeDrink: boolean = true;
            for (let ingredient of Array.from(drink.ingredientsAndQuantities.keys()))
            {
                // Options for the get to the micro -- pass the ingredient
                const requestOptions: any =
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    params: ingredient.name
                };

                try
                {
                    // Request info on this ingredients quantity from device
                    let res: AxiosResponse = await axios.get('', requestOptions);

                    // Get the response data and check for true
                    let drinkQuantity: number = res.data;
                    let requiredQuantity: number = drink.ingredientsAndQuantities.get(ingredient) || 0;

                    if (drinkQuantity < requiredQuantity)
                    {
                        drinkCreationMap.set(ingredient, false);
                        canMakeDrink = false;
                    }
                    else
                    {
                        drinkCreationMap.set(ingredient, true);
                    }
                }
                catch
                {
                    console.error("Cannot get drink quantity for " + ingredient.name);
                    drinkCreationMap.set(ingredient, false);
                    canMakeDrink = false;
                }
            }

            // Return whether this drink can be made -- include which ingredients are out
            ctx.response.body = {
                drinkCreationMap: drinkCreationMap,
                canMakeDrink: canMakeDrink
            };
        });
    }
}