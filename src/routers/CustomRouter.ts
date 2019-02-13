import * as Router from "koa-router"

// Class to create custom routers in a more structured manner
export abstract class CustomRouter
{
    public router: Router;

    protected title : string;

    public constructor(title : string, prefix?: string)
    {
        this.title = title;
        this.router = new Router({ prefix: prefix });

        // Create the routes -- will call the implemented method
        this.CreateRoutes();
    }

    // Method required to be implemented by the class to define the routes that the router uses
    protected abstract CreateRoutes(): void
}