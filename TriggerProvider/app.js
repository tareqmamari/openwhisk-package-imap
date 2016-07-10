var app = require('express')();
var bodyParser = require('body-parser');

var request = require('request');

var inbox = require('inbox');

const crypto = require('./crypto.js');

var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();
var cloudant = appEnv.getServiceCreds('Cloudant NoSQL DB-f7');

var retry = require('retry');
var operation = retry.operation({
	retries: 5,
	factor: 3,
	minTimeout: 1 * 1000,
	maxTimeout: 60 * 1000
});


var retriesBeforeDelete = 5;
var triggers = {};

/*****CLOUDANT******/
var cloudantUsername = cloudant.username;
var cloudantPassword = cloudant.password;
var cloudantDbPrefix = 'openwhisk_';
var cloudantDatabase = cloudantDbPrefix + 'imapservice';
var nano = require('nano')(cloudant.url);
nano.db.create(cloudantDatabase);
var db = nano.db.use(cloudantDatabase);
/*****CLOUDANT******/

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

app.use(bodyParser.json());

app.get('/ping', (req, res) => {
	res.send({
		msg: 'pong'
	});
});

app.post('/triggers', [isAuthenticated,], (req, res) => {
	var method = 'POST /triggers';
	console.log(method, "Incoming request");
	var newTrigger = req.body;

	if (!newTrigger.user) {
		return sendError(method, 400, "Missing parameters: required user parameter is missing", res);
	}

	if (!newTrigger.pass) {
		return sendError(method, 400, "Missing parameters: required pass parameter is missing", res);
	}

	if (!newTrigger.host) {
		return sendError(method, 400, "Missing parameters: required host parameter is missing", res);
	}

	if (!newTrigger.namespace) {
		return sendError(method, 400, "Missing parameters: required namespace parameter is missing", res);
	}

	newTrigger.apiKey = req.user.uuid + ":" + req.user.key;
	var triggerIdentifier = getTriggerIdentifier(newTrigger.apiKey, newTrigger.namespace, newTrigger.name);


	handleTriggerCreation(newTrigger, (error, result) => {
		if (error) {
			console.error(error);
			return sendError(method,400,'Failed: Trigger can not be created');
			// res.status(400).json({
			// 	failed: 'Trigger can not be created'
			// });
		} else {
			res.status(201).json({
				ok: 'your trigger was created successfully'
			});
		}
	});
	
	newTrigger.pass = crypto.encrypt(newTrigger.pass);
	operation.attempt((currentAttempt) => {
		db.insert(newTrigger, triggerIdentifier, (err) => {
			if (operation.retry(err)) {
				console.log("trigger can not be inserted into DB, currentAttempt: ", currentAttempt, "out of :");
				return;
			}
			console.log("inserted successfully");

		});
	});

});


function handleTriggerCreation(newTrigger, callback) {
	var triggerIdentifier = getTriggerIdentifier(newTrigger.apiKey, newTrigger.namespace, newTrigger.name);
	var client = inbox.createConnection(false, newTrigger.host, {
		secureConnection: true,
		auth: {
			user: newTrigger.user,
			pass: newTrigger.pass
		}
	});

	client.connect();

	client.on("connect", () => {
		console.log("Successfully connected to server");
		client.openMailbox(newTrigger.mailbox, (error, info) => {
			if (error) {
				return callback(err, null);
			}

			triggers[triggerIdentifier] = {
				client: client,
				retriesLeft: retriesBeforeDelete,
				apikey: newTrigger.apiKey,
				name: newTrigger.name,
				namespace: newTrigger.namespace
			};

			callback(null, "OK");

			console.log("Message count in ", newTrigger.mailbox, ":", info.count);

			client.on("new", (message) => {
				console.log("New incoming message " + message.title);
				fireTrigger(newTrigger.namespace, newTrigger.name, message, newTrigger.apiKey);
			});
		});
	});

	client.on("error", (error) => {
		return callback(error, null);
	});
}

function fireTrigger(namespace, name, payload, apiKey) {
	var triggerIdentifier = getTriggerIdentifier(apiKey, namespace, name);
	var baseUrl = "https://openwhisk.ng.bluemix.net/api/v1/namespaces";
	var keyPair = apiKey.split(':');
	var options = {
		method: "POST",
		url: baseUrl + "/" + namespace + "/triggers/" + name,
		json: payload,
		auth: {
			user: keyPair[0],
			pass: keyPair[1]
		}
	};

	request(options, (err, res, body) => {
		if (!err && res.statusCode == 200) {
			console.log("Trigger fired");
			triggers[triggerIdentifier].retriesBeforeDelete = retriesBeforeDelete;
		} else {
			triggers[triggerIdentifier].retriesBeforeDelete--;
			console.error("Can not fire trigger: " + err);
			console.log('http status code:', (res || {}).statusCode);
			console.log('error:', err);
			console.log('body:', body);
		}
	});
}

app.delete('/triggers/:namespace/:name', isAuthenticated, (req, res) => {
	var deleted = handleTriggerDeletion(req.params.namespace, req.params.name, req.user.uuid + ':' + req.user.key);
	if (deleted)
		res.status(200).json({
			ok: 'trigger ' + req.params.name + ' successfully deleted'
		});
	else
		res.status(404).json({
			error: 'trigger ' + req.params.name + ' not found'
		});
});

function handleTriggerDeletion(namespace, name, apikey) {
	var method = 'deleteTrigger';
	var triggerIdentifier = getTriggerIdentifier(apikey, namespace, name);
	if (triggers[triggerIdentifier]) {
		if (triggers[triggerIdentifier].client !== null) {
			triggers[triggerIdentifier].client.close();
			triggers[triggerIdentifier].client.on('close', () => {
				console.log("Disconnected");
			});
		}
		delete triggers[triggerIdentifier];

		console.log('trigger', triggerIdentifier, 'successfully deleted');

		db.get(triggerIdentifier, (err, body) => {
			if (!err) {
				db.destroy(body._id, body._rev, (err) => {
					if (err) {
						console.error(err);
					}
				});
			} else {
				console.error(method, 'there was an error while deleting', triggerIdentifier, 'from database');
			}
		});
		return true;
	} else {
		console.log('trigger', triggerIdentifier, 'could not be found');
		return false;
	}
}

function isAuthenticated(req, res, next) {
	var method = req.method + " " + req.path;
	if (!req.headers.authorization)
		return sendError(method, 401, "Unauthorized: authentication header expected", res);

	var parts = req.headers.authorization.split(" ");
	if (parts[0].toLowerCase() !== 'basic' || !parts[1])
		return sendError(method, 401, "Unauthorized: authentication header expected", res);

	var auth = new Buffer(parts[1], 'base64').toString();
	auth = auth.match(/^([^:]*):(.*)$/);
	if (!auth)
		return sendError(method, 401, "Unauthorized: authentication header expected", res);

	req.user = {
		uuid: auth[1],
		key: auth[2]
	};

	next();
}

function sendError(method, statusCode, message, res) {
	console.log(method, message);
	res.status(statusCode).json({
		error: message
	});
}

function getTriggerIdentifier(apikey, namespace, name) {
	return apikey + '/' + namespace + '/' + name;
}



function resetSystem() {
	var method = 'resetSystem';
	// logger.info(tid, method, 'resetting system from last state');
	console.log(method, 'resetting system from last state');
	db.list({
		include_docs: true
	}, (err, body) => {
		if (!err) {
			body.rows.forEach((trigger) => {
				trigger.doc.pass = crypto.decrypt(trigger.doc.pass);
				handleTriggerCreation(trigger.doc, (error, result) => {
					if (error) {
						console.warn(error);
						console.error(trigger.doc.triggerName, "can not be triggered");
					}
				});
			});
		} else {
			console.log(method, 'could not get latest state from database');
			// logger.error(tid, method, 'could not get latest state from database');
		}
	});
}

app.listen(appEnv.port || 3000, '0.0.0.0', () => {
	console.log("server starting on ", (appEnv.url || 'localhost'), ":", (appEnv.port || 3000));
	resetSystem();
});