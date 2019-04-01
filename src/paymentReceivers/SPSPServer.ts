const chalk = require('chalk');
const getPort = require('get-port');
const makePlugin = require('ilp-plugin');
const localtunnel = require('localtunnel');
const { Server } = require('ilp-protocol-stream');
const Koa = require('koa');
const app = new Koa();
import * as crypt from 'crypto';

const name = crypt.randomBytes(8).toString('hex');
const paymentPointer: string = '$' + name + '.localtunnel.me';
let streamServer: any;

async function run(callback: (orderHash: string, amount: number, method: string) => Promise<any>): Promise<any>
{
    // May want to do paymentPointers in HTTPS format?
    console.log('connecting...');
    const streamPlugin = makePlugin();

    await streamPlugin.connect();

    // Set the port manually to expose on docker
    const port = 3000;
    streamServer = new Server({
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
                // Set the values in this closure? -- Hopefully this works
                console.log('Got packet for', amount, 'units');
                stream.on('data', async (data: any) =>
                {
                    // Make sure that this executes correctly! data -> money
                    data = data.toString();
                    await callback(data, amount, 'interledger');
                });
            });
        });
    });

    await streamServer.listen();

    async function handleSPSP(ctx: any, next: any)
    {
        if (ctx.get('Accept').indexOf('application/spsp4+json') !== -1)
        {
            const details = streamServer.generateAddressAndSecret();
            ctx.body = {
                destination_account: details.destinationAccount,
                shared_secret: details.sharedSecret.toString('base64')
            };
            ctx.set('Content-Type', 'application/spsp4+json');
            ctx.set('Access-Control-Allow-Origin', '*');
        }
    }

    app
        .use(handleSPSP)
        .listen(port);

    console.log('listening on ' + port);
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
}

export const SPSPServer = {
    paymentPointer,
    run: run
};