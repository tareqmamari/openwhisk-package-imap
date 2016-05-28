var express = require('express');
var app = express();

var request = require('request');

var inbox = require('inbox');

var bodyParser = require('body-parser');

var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();

var retriesBeforeDelete = 5;
var triggers = {};


/*****CLOUDANT******/
// var cloudantUsername = process.env.CLOUDANT_USERNAME;
// var cloudantPassword = process.env.CLOUDANT_PASSWORD;
// var cloudantDbPrefix = process.env.DB_PREFIX;
// var cloudantDatabase = cloudantDbPrefix + "imapservice";
// var nano = require('nano')('https://' + cloudantUsername + ':' + cloudantPassword + '@' + cloudantUsername + '.cloudant.com');
// nano.db.create(cloudantDatabase);
// var db = nano.db.use(cloudantDatabase);
/*****CLOUDANT******/


//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

app.use(bodyParser.json());


app.get("/ping", (req, res) => {
	res.send({
		msg: 'pong'
	});
});


app.post('/triggers', isAuthenticated, (req, res) => {
	console.log("# of triggers", Object.keys(triggers).length);

	var method = 'POST /triggers';
	var newTrigger = req.body;
	console.log("GOT: " + JSON.stringify(newTrigger));

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
	handleTriggerCreation(newTrigger, (error, result) => {
		if (error) {
			console.error(error);
			return sendError(method, 400, "Trigger can not be created", res);
		} else {
			res.status(201).json({
				ok: 'your trigger was created successfully'
			});
		}
	});

});

function handleTriggerCreation(newTrigger, callback) {
	var triggerIdentifier;

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

			var triggerIdentifier = getTriggerIdentifier(newTrigger.apiKey, newTrigger.namespace, newTrigger.name);
			console.log("triggerIdentifier", triggerIdentifier);
			triggers[triggerIdentifier] = {
				client: client,
				retriesLeft: retriesBeforeDelete,
				apikey: newTrigger.apiKey,
				name: newTrigger.name,
				namespace: newTrigger.namespace

			};

			callback(null, "OK");
			console.log("Message count in INBOX: ", info.count);

			client.on("new", (message) => {
				console.log("New incoming message " + message.title);
				if(triggers[triggerIdentifier].retriesBeforeDelete>0)
				fireTrigger(params.namespace, params.name, message, params.apiKey);
			});
		});

	});

	client.on("error", (error) => {
		return callback(error, null);
	});
}

function fireTrigger(namespace, name, payload, apiKey) {
	var triggerIdentifier = getTriggerIdentifier(newTrigger.apiKey, newTrigger.namespace, newTrigger.name);
	var baseUrl = "https://openwhisk.ng.bluemix.net/api/v1/namespaces";
	var keyPair = apiKey.split(':');
	var options = {
		method: "POST",
		url: baseUrl + "/" + namespace + "/triggers/" + name,
		body: JSON.stringify(payload),
		auth: {
			user: apiKey[0],
			pass: apiKey[1]
		},
		headers: {
			'Content-Type': 'application/json'
		}
	};
	request(options, (err, res, body) => {
		if (!err && res.statusCode == 200) {
			console.log("Trigger fired");
		} else {
			triggers[triggerIdentifier].retriesBeforeDelete--;
			console.error("Can not fire trigger: " + err);
			console.log('http status code:', (res || {}).statusCode);
			console.log('error:', err);
			console.log('body:', body);
		}
	});
}

app.delete('/triggers/:namespace/:name', isAuthenticated, function(req, res) {
	var deleted = handleTriggerDeletion(req.params.namespace, req.params.name, req.user.uuid + ':' + req.user.key);
	if (deleted) {
		res.status(200).json({
			ok: 'trigger ' + req.params.name + ' successfully deleted'
		});
	} else {
		res.status(404).json({
			error: 'trigger ' + req.params.name + ' not found'
		});
	}
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

		// db.get(triggerIdentifier, function(err, body) {
		// 	if (!err) {
		// 		db.destroy(body._id, body._rev, function(err) {
		// 			if (err) logger.error(tid, method, 'there was an error while deleting', triggerIdentifier, 'from database');
		// 		});
		// 	} else {
		// 		logger.error(tid, method, 'there was an error while deleting', triggerIdentifier, 'from database');
		// 	}
		// });
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

app.listen(appEnv.port || 3000, '0.0.0.0', () => {
	// app.listen(3000, '0.0.0.0', () => {

	// console.log("server starting on " + (3000));
	console.log("server starting on " + (appEnv.port || 3000));
});