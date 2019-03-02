const chalk = require('chalk');
const getPort = require('get-port');
const makePlugin = require('ilp-plugin');
const localtunnel = require('localtunnel');
const { Server } = require('ilp-protocol-stream');
const Koa = require('koa')
const app = new Koa()
import * as crypt from 'crypto';
import axios, { AxiosResponse } from 'axios';

const name = crypt.randomBytes(8).toString('hex')

export default async function run(callback: (amount: number) => Promise<any>)
{
    console.log('connecting...');
    const streamPlugin = makePlugin();

    await streamPlugin.connect();

    // Set the port manually to expose on docker
    const port = 3000;
    const streamServer = new Server({
        plugin: streamPlugin,
        serverSecret: crypt.randomBytes(32)
    });

    streamServer.on('connection', (connection: any) => 
    {
        connection.on('stream', (stream: any) => 
        {
            stream.setReceiveMax(10000000000000);
            stream.on('money', async (amount: any) => 
            {
                console.log('got packet for', amount, 'units');

                const requestOptions: any =
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        amount: amount
                    })
                };

                // Call the buy drink -- this should retrieve what drink this person wants
                try
                {
                    //const res: AxiosResponse = await axios.post('http://localhost:8080/order', requestOptions);
                    const res: any = await callback(amount);

                    // This should never fail, and cant return data anyway, so whatever
                    console.log(res);
                }
                catch (error)
                {
                    // Should never end up here
                    console.error(error);
                }
            });
        });
    });

    await streamServer.listen();

    async function handleSPSP(ctx: any, next: any)
    {
        if (ctx.get('Accept').indexOf('application/spsp4+json') !== -1)
        {
            const details = streamServer.generateAddressAndSecret()
            ctx.body = {
                destination_account: details.destinationAccount,
                shared_secret: details.sharedSecret.toString('base64')
            }
            ctx.set('Content-Type', 'application/spsp4+json')
            ctx.set('Access-Control-Allow-Origin', '*')
        }
    }

    app
        .use(handleSPSP)
        .listen(port);

    console.log('listening on ' + port);
    const paymentPointer: string = '$' + name + '.localtunnel.me';
    localtunnel(port, { subdomain: name }, (err: any, tunnel: any) => 
    {
            if (err) 
            {
                console.error(err);
                process.exit(1);
            }

            console.log(chalk.green('public at:', tunnel.url));
            console.log(chalk.green('payment pointer is:', paymentPointer));
    });

    return paymentPointer;
}