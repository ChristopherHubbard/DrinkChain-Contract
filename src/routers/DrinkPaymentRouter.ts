import { Context } from "koa";
import axios, { AxiosResponse } from 'axios';
import { InvoiceReceiver, Receipt, createPlugin, receive, pay } from 'ilp';

// Import base route class
import { CustomRouter } from "./CustomRouter";

// Import the drink config file
const drinks: Map<string, number> = new Map<string, number>(Object.entries(require('../config/pricing.json').drinksAndPrices));
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const deviceURL: string = require('../config/deviceConnection.json').deviceURL;

// Set the locals
const invoiceNoLimit: number = 1000000;
const receivers: Map<number, InvoiceReceiver> = new Map<number, InvoiceReceiver>();
const paymentTimeout: number = 3 * 1000;
let invoiceNoCount: number = 0;

export class DrinkPaymentRouter extends CustomRouter
{
    public constructor(title: string, prefix?: string)
    {
        super(title, prefix);

        // Create the routes -- will call the implemented method
        this.CreateRoutes();
    }

    private async createInvoice(ctx: Context, next: Function)
    {
        const drink: string = ctx.request.query.action;
        
        try
        {
            const receiver: InvoiceReceiver = await receive(drinks.get(drink) as number, 'test-payment-123');
            receivers.set(invoiceNoCount, receiver);

            // Send the invoice back -- needed for the resolution with payment-request client side
            ctx.body = {
                invoice: receivers.get(invoiceNoCount),
                invoiceNo: invoiceNoCount
            };

            invoiceNoCount++;

            // Reset the invoice number and set the count to zero
            if (invoiceNoCount >= invoiceNoLimit)
            {
                invoiceNoCount = 0;
            }
        }
        catch (error)
        {
            ctx.throw(error);
        }
    }

    private async awaitPayment(ctx: Context, next: Function)
    {
        // Get the invoiceNo from the user
        const { invoiceNo } = ctx.request.query;

        // Try to get the invoice and set up the payment receiver
        try
        {
            const receiver: InvoiceReceiver = receivers.get(Number(invoiceNo)) as InvoiceReceiver;
            const receiverReceipt: Receipt = await receiver.receivePayment(paymentTimeout);

            // Pay the host's payment pointer this amount
            const finalReceipt: Receipt = await pay({
                amount: receiverReceipt.received.amount,
                paymentPointer: '$chris.localtunnel.me'
            });
        }
        // If the payment fails the item should come here
        catch (error)
        {
            ctx.throw(error);
        }
    }

    // Implement the route creating method
    protected CreateRoutes(): void
    {
        this.router.get('/invoice', this.createInvoice, async (ctx: Context, next: Function): Promise<any> =>
        {
            // Send the request to create an invoice for this payment
            ctx.status = 200;
        });

        this.router.get('/pay', this.awaitPayment, async (ctx: Context, next: Function) =>
        {
            // Send the action request to the device/bar
            const { action, infoFields } = ctx.request.query;

            const requestOptions: any =
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                params: {
                    ingredients: actionsRequirements.get(action),
                    destination: infoFields.destination
                }
            };

            try
            {
                const res: AxiosResponse = await axios.get(`${deviceURL}/order`, requestOptions);

                // How to process the response?

                ctx.status = 200;
            }
            catch (error)
            {
                ctx.status = 500;


                // Pay back a refund?
            }
        })
    }
}