import * as Koa from "koa";
import * as combineRouters from "koa-combine-routers";
import * as serve from "koa-static";
import { DrinkPaymentRouter, ContractInfoRouter } from "./routers";

let path: any = require("path");

// Set the port to listen on -- may want to make this more customizable
const PORT: number = 8080;

export default class Server
{
    public app : Koa

    public constructor()
    {
        // Create an ExpressJS application instance
        this.app = new Koa();

        // Configure the application
        this.Configure();

        // Add the routes
        this.Routes();
    }

    public Configure()
    {
        // Add static paths -- needs to be updated for the different frontend methods

        // Add error handling
        this.app.on("error", console.error);

        // Listen on a port
        this.app.listen(PORT);
    }

    private Routes()
    {
        // Attach all the routers
        const combinedRouter = combineRouters(
            new ContractInfoRouter("This is the router for contract information").router,
            new DrinkPaymentRouter("This is the router to send payed requests to the device", "/payment").router
        );
        
        // Use the router middleware -- combine all the routers
        this.app.use(combinedRouter());
    }
}