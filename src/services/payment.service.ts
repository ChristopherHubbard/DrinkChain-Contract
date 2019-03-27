
// Use semi-deprecated ilp-price to the request the exchange rate to the requestors payment pointer
const ilpPrice: any = require('ilp-price');

const { usdExchangeRate } = require('../config/pricing.json');

const exchangeRate = async (clientCurrency: string, clientPaymentPointer: string, hostCurrency: string, hostPaymentPointer: string): Promise<number> =>
{
    if (hostCurrency !== clientCurrency)
    {
        if (clientCurrency !== 'USD' && clientPaymentPointer !== undefined)
        {
            // Construct the dynamic price fetch object using the currency and payment pointer as landmarks -- dont use this for USD!
            const priceFetch: any = new ilpPrice({
                landmarks: {
                    "g.": {
                        [clientCurrency]: [
                            clientPaymentPointer
                        ],
                        [hostCurrency]: [
                            hostPaymentPointer
                        ]
                    }
                }
            });

            // Fetch the real exchange rate between these currencies -- keep in mind this requires the client to be hosting an spsp-server
            const [clientValue, hostValue]: Array<number> = await Promise.all([
                priceFetch.fetch(clientCurrency, 1),
                priceFetch.fetch(hostCurrency, 1)
            ]);

            // Divide the client and host values to get the exchange rate?
            return await clientValue / hostValue;
        }
        else if (clientCurrency !== 'USD')
        {
            console.error('The client SPSP server is not running!');
            return await -1;
        }
        else
        {
            // Call the service for the current USD value of the base currency listed -- the host currency is definitely not USD
            // Should I just require USD to have defined prices as well?
            // Let the contract creator define their exchange rate to USD!!
            return await usdExchangeRate;
        }
    }
    else
    {
        // The currencies are the same
        return await 1;
    }
}

export const paymentService = {
    exchangeRate: exchangeRate,
}