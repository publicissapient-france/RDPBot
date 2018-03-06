/*jshint esversion: 6 */
/*jshint asi: true */

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const AWS = require('aws-sdk')
const { WebClient } = require('@slack/client')
require("dotenv").config()

const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const API_TOKEN = process.env.API_TOKEN
const BOT_API_TOKEN = process.env.BOT_API_TOKEN
const RDP_REACTION_ID = process.env.RDP_REACTION_ID // Should be "bookmark"
const RDP_LINK = process.env.RDP_LINK
const DEBUG = process.env.DEBUG
const REMINDER_DELAY = DEBUG ? "In 5 seconds" : process.env.REMINDER_DELAY
const RDP_CHANNEL = process.env.RDP_CHANNEL

const app = express()
const web = new WebClient(API_TOKEN)
const webBot = new WebClient(BOT_API_TOKEN)
app.use(bodyParser.json())

function createResponseErrorBody(error) {
    let responseBody = { }
    let response = { }
    responseBody.error = error
    response.statusCode = 503
    response.body = JSON.stringify(responseBody)
    return response
}

function logDebug(message) {
    if (DEBUG) {
        console.log(message)
    }
}

exports.handler = function(event, context, callback) {
    const eventBody = JSON.parse(event.body)
    
    let response = {
        statusCode: 200
    }
    
    if (eventBody.challenge != null) {
        const responseBody = { challenge: eventBody.challenge }
        response.body = JSON.stringify(responseBody)
        callback(null, response)
        return        
    }
    
    if (typeof(eventBody.event) == "undefined") {
        callback(null, createResponseErrorBody("eventBody.event is undefined"))
        return
    }
    
    if (eventBody.event.reaction != RDP_REACTION_ID) {
        logDebug("This reaction (" + eventBody.event.reaction + ") is not handled by RDPSlack")
        callback(null, response)
        return
    }

    logDebug(eventBody)
    
    var text = ""
    var user = ""

    callback(null, response)
    
    logDebug("1. Finding message")
    findMessage(eventBody.event.item.channel, eventBody.event.item.ts)
        .then((success) => {
            text = success.text
            user = success.user
            logDebug("2. Sharing to channel")
            return shareToChannel(text)
        })
        .then((_) => {
            logDebug("3. Sending immediate reminder")
            return sendImmediateReminder(text, user)
        })
        .then((_) => {
            logDebug("4. Sending deferred reminder")
            return sendDeferredReminder(text, user)
        })
        .then((_) => {
            logDebug("5. Sent deferred reminder")
            callback(null, response)
        })
        .catch((error) => {
            console.error(error)
            callback(null, createResponseErrorBody(error))
        });
}

function findMessage(channel, timestamp) {
    const query = "?token=" + API_TOKEN + "&channel=" + channel + "&count=1&inclusive=1&latest=" + timestamp + "&oldest=" + timestamp
    const api = "channels.history"
    const options = { 
        method: 'GET',
        url: 'https://slack.com/api/' + api + query 
    }
    
    return new Promise((resolve, reject) => {
        request(options, function (error, response, body) {
            if (error) {
                reject("findMessage: " + error)
                return
            }
            
            const bodyData = JSON.parse(body)
            logDebug(bodyData)
            
            if (bodyData.ok == false) {
                console.error(bodyData)
                reject("findMessage: " + bodyData.error)
                return
            }
            
            if (bodyData.messages.count == 0) {
                reject("findMessage: " + "No messages found")
                return
            }
            
            let success = {
                "text": bodyData.messages[0].text,
                "user": bodyData.messages[0].user
            }
            
            resolve(success)
        })
    })
}

function shareToChannel(messageText) {
    return web.chat.postMessage(RDP_CHANNEL, messageText)
}

function sendImmediateReminder(messageText, userId) {
    const text = "Tu viens de partager " + messageText + ".\nÇa te dirait de l'ajouter à la RdP ? (<" + RDP_LINK + ">)"
    return webBot.chat.postMessage(userId, text, {
        as_user: false        
    })
}

function sendDeferredReminder(messageText, userId) {
    const fullMessageText = "Ajouter " + messageText + " à la RdP.\nLe lien pour la RdP sur l'Intranet est : <" + RDP_LINK + ">"
    return web.reminders.add(fullMessageText, REMINDER_DELAY, {
        user: userId 
    })
}

app.get('/oauth', function(req, res) {
    if (!req.query.code) {
        res.status(500);
        res.send({"Error": "Looks like we're not getting code."});
    } else {
        request({
            url: 'https://slack.com/api/oauth.access', 
            qs: {code: req.query.code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET},
            method: 'GET'
        }, function (error, response, body) {
            if (error) {
                console.error("oauth: " + error);
            } else {
                res.json(body);                
            }
        })
    }
});
