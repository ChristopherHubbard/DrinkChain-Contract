const Price = require('ilp-price');
const { exchangeRates } = require('../config/pricing.json');

const exchangeRate = async (clientCurrency: string, clientPaymentPointer: string, hostCurrency: string, hostPaymentPointer: string): Promise<number> =>
{
    if (clientPaymentPointer && clientCurrency !== 'USD')
    {
        // No way to find the exact exchange rate currently...
        const [clientExchangeRate, hostExchangeRate]: Array<number> = await Promise.all([
            determineExchangeRate(clientCurrency, clientPaymentPointer),
            determineExchangeRate(hostCurrency, hostPaymentPointer)
        ]);

        return clientExchangeRate / hostExchangeRate;
    }
    else if (clientCurrency === 'USD')
    {
        return exchangeRates[clientCurrency];
    }
    else
    {
        console.error('The client SPSP server is not running!');
        return await -1;
    }
}

const determineExchangeRate = async (currency: string, paymentPointer: string): Promise<any> =>
{
    const price = new Price({
        landmarks: {
            [currency]: [
                paymentPointer
            ]
        }
    });

    return await price.fetch(currency, 1);
}

export const paymentService = {
    exchangeRate: exchangeRate
}