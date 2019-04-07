import { SPSP, createPlugin } from 'ilp/src';
import axios, { AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { OrderData } from "../models";

const { assetScale, actionsAndPrices } = require('../config/pricing.json');
const { deviceURL } = require('../config/deviceConnection.json');
const { paymentPointer } = require('../config/payments.json');

// Create some locals
const actionsRequirements: Map<string, any> = new Map<string, any>(Object.entries(require('../config/actionsRequirements.json').actions));
const drinks: Map<string, number> = new Map<string, number>(Object.entries(actionsAndPrices));

// Set up a hash -> orderData map for managing the order information without timeout
// What to use for hash? -- Order numb
const orderMap: Map<string, OrderData> = new Map<string, OrderData>();

// Set the locals -- is there a better way to manage the paymentTimeout and currentData?
const paymentTimeout: number = 30 * 10000;

const order = async (orderHash: string, amount: number, method: string): Promise<any> =>
{
    // Send the request to the bar -- use the currently set data
    if (typeof orderMap.get(orderHash) !== undefined)
    {
        const { action, infoFields } = orderMap.get(orderHash) as OrderData;

        // Fix this to compare against the exchange rate in USD case
        if (Number(amount) < (drinks.get(action) as number) * Math.pow(10, assetScale))
        {
            // Amount is not paid in full -- currently only full payments are supported, since refunds fail
            console.error('Action was not paid for in full!');
            throw new Error('500 error');
        }

        // Send the payment to the owner's SPSP pointer -- should still be available since query
        if (method === 'interledger')
        {
            await SPSP.pay(createPlugin(), {
                receiver: paymentPointer,
                sourceAmount: Number(amount)
            });
        }

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

            // Remove the data
            orderMap.delete(orderHash);
        }
        catch (error)
        {
            // There was some error sending to the bar
            console.error('Error on order!');
        }
    }
    else
    {
        // Return error
        console.error('Data not found!');
    }
}

const createData = (action: string, infoFields: any): string =>
    {
        if (drinks.get(action) !== undefined)
        {
            // Set the data and create the timeout -- how long?
            const currentData: OrderData = {
                action: action,
                infoFields: new Map<string, string>(Object.entries(infoFields)),
                date: new Date()
            };

            // This orderHash needs to be set in ILP to let callback know the order
            const currentDataHash: string = createHash('sha256')
                                                .update(JSON.stringify(currentData), 'utf8')
                                                .digest('hex');

            // Add the orderData to the map?
            orderMap.set(currentDataHash, currentData);

            // Set the timeout to remove the data
            setTimeout(() =>
            {
                // Delete the orderData from the map
                orderMap.delete(currentDataHash);
            }, paymentTimeout);

            return currentDataHash;
        }
        else
        {
            // What to do on a failure?
            console.error('Error creating the payment data')
            return '';
        }
    }

export const orderService = {
    orderMap: orderMap,
    order: order,
    createData: createData,
};