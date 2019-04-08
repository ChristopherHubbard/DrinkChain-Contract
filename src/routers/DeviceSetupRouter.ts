import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';

// Import base route class
import { CustomRouter } from "./CustomRouter";

// Import the config files for this bar
const { deviceURL } = require('../config/deviceConnection.json');

export class DeviceSetupRouter extends CustomRouter
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
        this.router.post('/setup', async (ctx: any, next: Function): Promise<any> =>
        {
            // Get the password for this device from the user -- is this secure?
            const { password } = JSON.parse(ctx.request.body.body);

            const requestOptions: any =
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: {
                    password: password
                }
            };

            // This method should update the device with this contract as the only accepted origin
            try
            {
                const response: AxiosResponse = await axios.post(`${deviceURL}/setup`, requestOptions);

                // Check the response to see if successful setup
                const { configured } = response.data;

                ctx.body = {
                    success: configured
                }
                ctx.status =  configured ? 200 : 400;
            }
            catch (error)
            {
                console.error(error);

                ctx.status = 500;
            }
        });
    }
}