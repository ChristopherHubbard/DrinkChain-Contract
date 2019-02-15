# codius-bar-contract

#################### Installation ##########################

# Install node packages
npm install

# Ensure that moneyd and moneyd-xrp-uplink are both installed
npm install -g moneyd moneyd-xrp-uplink

# Build Application
npm run build or Launch in VS Code

##################### Start moneyd connection ######################

# Add --testnet to any commands to run moneyd in testing mode

# Configure XRP connection
moneyd xrp:configure --advanced

# Set BTP host
ilsp1.phobosnode.com

# Use any name for the channel (no duplicates)

# Use default rippled server

# Use XRP secret key for your wallet (must have >35 XRP)
# Never use a XRP wallet with a large amount of assets for development
# Address will be populated by default

#################### Run the tests #########################################
npm run test