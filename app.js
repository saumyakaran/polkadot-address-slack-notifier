const { ApiPromise, WsProvider } = require("@polkadot/api");
const dotenv = require("dotenv");
const https = require("https");
const chalk = require("chalk");

dotenv.config();

const webhookURL = process.env.SLACK_WEBHOOK_URL;
const addressToWatch = process.env.WATCH_ADDRESS;
const network = process.env.NETWORK;
const suffix = process.env.NETWORK_SUFFIX;
const decimals = process.env.NETWORK_DECIMALS;
const rpc = process.env.RPC;

const { bold, underline } = chalk;
const success = chalk.green;
const info = chalk.blue;
const error = chalk.red;

async function main() {
	if (!webhookURL) {
		console.error(error("Please fill in your Webhook URL"));
	}

	const wsProvider = new WsProvider(rpc);
	const api = await ApiPromise.create({ provider: wsProvider });

	watchBalance(addressToWatch, api);
}

async function watchBalance(address, api) {
	console.log(info("👀 Watching ") + address);
	let {
		data: { free: previousFree },
		nonce: previousNonce,
	} = await api.query.system.account(address);

	const addressWatcherStartedNotification = {
		username: "Balance change notifier", // This will appear as user name who posts the message
		text: "Started watching address", // text
		icon_emoji: ":eyes:", // User icon, you can also use custom icons here
		attachments: [
			{
				// this defines the attachment block, allows for better layout usage
				color: "#dddddd", // color of the attachments sidebar.
				fields: [
					// actual fields
					{
						title: "👀 Watch address", // Custom field
						value: address,
					},
					{
						title: "💰 Current balance", // Custom field
						value: previousFree / 10 ** decimals + " " + suffix, // Custom value
						short: true, // long fields will be full width
					},
					{
						title: "🔗 Subscan", // Custom field
						value: `${network.toLowerCase()}.subscan.io/account/${address}`
						short: true, // long fields will be full width
					},
				],
			},
		],
	};

	console.log(
		`👉🏻 ${underline(
			address.slice(0, 4) + "..." + address.slice(-4)
		)} has a balance of ${bold(
			previousFree / 10 ** decimals + " " + suffix
		)}, nonce ${previousNonce}\n`
	);

	try {
		const slackResponse = await sendSlackMessage(
			webhookURL,
			addressWatcherStartedNotification
		);
		console.log(info("info ") + "Message response", slackResponse);
	} catch (e) {
		console.error(error("error ") + "There was an error with the request", e);
	}

	// Here we subscribe to any balance changes and update the on-screen value
	api.query.system.account(
		address,
		async ({ data: { free: currentFree }, nonce: currentNonce }) => {
			// Calculate the delta
			const change = currentFree.sub(previousFree);

			if (!change.isZero()) {
				console.log(
					change < 0
						? `💸 Sent ${error(
								Math.abs(change) / 10 ** decimals + " " + suffix
						  )}\n${info("nonce ") + currentNonce}\n`
						: `🤑 Received ${success(change / 10 ** decimals + " " + suffix)}`
				);

				const balanceChangeNotification = {
					username: "Balance change notifier", // This will appear as user name who posts the message
					text: "New balance change", // text
					icon_emoji: ":moneybag:", // User icon, you can also use custom icons here
					attachments: [
						{
							// this defines the attachment block, allows for better layout usage
							color: change < 0 ? "#d62d20" : "#2eb886", // color of the attachments sidebar.
							fields: [
								// actual fields
								{
									title: change < 0 ? "💸 Sent" : "🤑 Received", // Custom field
									value: Math.abs(change) / 10 ** decimals + suffix, // Custom value
									short: true, // long fields will be full width
								},
								{
									title: "Network", // Custom field
									value: network, // Custom value
									short: true, // long fields will be full width
								},
								{
									title: "Address", // Custom field
									value: address, // Custom value
								},
							],
						},
					],
				};

				try {
					const slackResponse = await sendSlackMessage(
						webhookURL,
						balanceChangeNotification
					);
					console.log(info("info ") + "Message response", slackResponse);
				} catch (e) {
					console.error(
						error("error ") + "There was an error with the request",
						e
					);
				}

				previousFree = currentFree;
				previousNonce = currentNonce;
			}
		}
	);
}

/**
 * Handles the actual sending request.
 * We're turning the https.request into a promise here for convenience
 * @param webhookURL
 * @param messageBody
 * @return {Promise}
 */
function sendSlackMessage(webhookURL, messageBody) {
	// make sure the incoming message body can be parsed into valid JSON
	try {
		messageBody = JSON.stringify(messageBody);
	} catch (e) {
		throw new Error("Failed to stringify messageBody", e);
	}

	// Promisify the https.request
	return new Promise((resolve, reject) => {
		// general request options, we defined that it's a POST request and content is JSON
		const requestOptions = {
			method: "POST",
			header: {
				"Content-Type": "application/json",
			},
		};

		// actual request
		const req = https.request(webhookURL, requestOptions, (res) => {
			let response = "";

			res.on("data", (d) => {
				response += d;
			});

			// response finished, resolve the promise with data
			res.on("end", () => {
				resolve(response);
			});
		});

		// there was an error, reject the promise
		req.on("error", (e) => {
			reject(e);
		});

		// send our message body (was parsed to JSON beforehand)
		req.write(messageBody);
		req.end();
	});
}

main();
