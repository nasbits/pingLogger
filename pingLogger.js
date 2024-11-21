const fs = require('fs');
const readline = require('readline');
const https = require('https');
const FormData = require('form-data');  // New module to handle form-data for file upload

// Path to save the config file
const configFilePath = './config.json';

// Function to create a readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to prompt user for the Discord webhook URLs
const setupWebhookConfig = () => {
    console.log('Welcome to the Setup Wizard for the Ping Logger!');

    rl.question('Please enter your Discord Webhook URLs (comma-separated if multiple): ', (webhookUrlsInput) => {
        const webhookUrls = webhookUrlsInput.split(',').map(url => url.trim()).filter(url => url.startsWith('https://discord.com/api/webhooks/'));
        
        if (webhookUrls.length > 0) {
            const config = { webhookUrls, sites: [] };
            fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
            console.log(`Webhook URLs have been successfully saved to ${configFilePath}`);
            rl.close();
            loadConfig();
        } else {
            console.log('Invalid URL(s). Please enter valid Discord Webhook URL(s).');
            rl.close();
        }
    });
};

// Function to load the configuration (webhook URLs and sites) from config.json
const loadConfig = () => {
    if (!fs.existsSync(configFilePath)) {
        console.log('No configuration found. Running setup wizard...');
        setupWebhookConfig();
    } else {
        const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        if (!config.sites || config.sites.length === 0) {
            console.log("No sites found in configuration, please add sites to 'config.json'.");
        } else {
            startPingLogger(config.webhookUrls, config.sites);
        }
    }
};

// Function to create the XML file with ping results
const createXmlLog = (sites, responses) => {
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;

    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<pingLog date="${formattedDate}">\n`;

    sites.forEach((site, index) => {
        xmlContent += `  <site>\n    <url>${site}</url>\n    <status>${responses[index]}</status>\n    <timestamp>${formattedDate}</timestamp>\n    <responseTime>${Math.random() * 1000} ms</responseTime>\n  </site>\n`;
    });

    xmlContent += '</pingLog>';
    const xmlFileName = `pingLog_${formattedDate}.xml`;
    fs.writeFileSync(xmlFileName, xmlContent);

    return xmlFileName;
};

// Function to send the XML file to the Discord webhook as an attachment
const sendToWebhook = (webhookUrl, xmlFileName) => {
    const form = new FormData();  // Using form-data to send the file as an attachment
    form.append('file', fs.createReadStream(xmlFileName), xmlFileName);  // Attach the file
    form.append('content', `Hello there! 👋 A new ping log has been generated: ${xmlFileName}. Please find the details attached. Thank you very much!`);

    const url = new URL(webhookUrl);
    console.log(`Sending data to webhook: ${webhookUrl}`);
    
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: form.getHeaders()  // Setting headers for the form-data
    };

    const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (d) => {
            responseData += d;
        });

        res.on('end', () => {
            console.log(`Webhook Response: ${responseData}`);
            console.log(`Successfully sent the ping log with XML attachment to webhook: ${webhookUrl}`);
        });
    });

    req.on('error', (error) => {
        console.error(`Error sending to webhook: ${error.message}`);
    });

    // Pipe the form data to the request
    form.pipe(req);
};

// Function to ping the sites
const pingSites = (sites, webhookUrls) => {
    console.log('Pinging sites...');
    const responses = sites.map((site) => {
        return new Promise((resolve) => {
            https.get(site, (res) => {
                const status = res.statusCode === 200 ? 'Online' : 'Offline';
                console.log(`${site} is currently ${status}.`);
                resolve(status);
            }).on('error', (err) => {
                console.error(`Error pinging ${site}: ${err.message}`);
                console.log(`${site} is currently Offline.`);
                resolve('Offline');
            });
        });
    });

    Promise.all(responses).then((results) => {
        const xmlFileName = createXmlLog(sites, results);
        console.log(`Generated XML file: ${xmlFileName}`);

        // Send the log to all webhook URLs
        webhookUrls.forEach(webhookUrl => {
            sendToWebhook(webhookUrl, xmlFileName);
        });
    });
};

// Function to start the ping logger
const startPingLogger = (webhookUrls, sites) => {
    console.log('Starting Ping Logger...');

    // Ping sites immediately on startup
    pingSites(sites, webhookUrls);

    // Then continue pinging every 10 minutes (600,000 ms)
    setInterval(() => pingSites(sites, webhookUrls), 600000);
};

// Load the config and start the logger
loadConfig();

