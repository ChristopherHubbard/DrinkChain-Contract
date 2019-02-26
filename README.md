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

# Start moneyd
moneyd xrp:start --admin-api-port 7769

# Optional: Connect with moneyd-gui
npm install -g moneyd-gui
moneyd-gui

#################### Run the tests #########################################
npm run test

#################### Upload the contract #########################################

# Dockerize the application
npm run dockerize

# Push to dockerhub
docker push cbhubb8/codius-bar-contract

# A digest should be printed -- copy that to the digest section of the codius.json file

# Upload to the top codius host from the codius host site -- delete codiusstate.json file if necessary
codius upload --host https://hodling-xrp.org --duration 300