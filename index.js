var debug = require('debug')('vhs-hookhub-github-nomos');
debug("Loading vhs-hookhub-github-nomos");
debug(__dirname);

var express = require('express');
var router = express.Router();
var config = require('./config');
const xHubSignatureMiddleware = require('x-hub-signature').middleware;
const smb = require('slack-message-builder');
var rp = require('request-promise');

// Perform sanity check
router.use(function (req, res, next) {
  if (req.header('X-Hub-Signature') == undefined || req.header('X-Hub-Signature').length < 40 || req.header('X-GitHub-Event') == undefined || req.header('X-GitHub-Event') == '' || req.rawBody == undefined) {
    res.status(412).send({
      result: "ERROR",
      message: "Missing or invalid request arguments"
    });
  } else {
    next();
  }
});

// Check X-Hub-Signature
router.use(xHubSignatureMiddleware({
  algorithm: 'sha1',
  secret: config.github.secret,
  require: true,
  getRawBody: function (req) {
    return req.rawBody;
  }
}));

/* Default handler. */
router.use('/', function (req, res, next) {
  debug("Handling default request");

  let post_body = generateMessage(req.header('X-GitHub-Event'), req.body);

  debug("post_body:", post_body);

  var post_options = {
    method: 'POST',
    uri: config.slack.url,
    body: post_body,
    json: true // Automatically stringifies the body to JSON
  };

  rp(post_options).then(function (data) {
    return {
      result: "OK",
      message: data
    };
  }).catch(function (err) {
    return {
      result: "ERROR",
      message: err
    };
  }).then(function (result_set) {
    res.send(result_set);
  });
});

module.exports = router;

var generateMessage = function (event_type, payload) {
  var slack_message = smb()
    .username(config.slack.options.username)
    .iconEmoji(config.slack.options.icon_emoji)
    .channel(config.slack.options.channel);

  switch (event_type) {
    case 'push':
      payload.commits.forEach(function (commit) {
        slack_message = slack_message
          .text("The following commit(s) got pushed to '" + payload.repository.name + "':\r\r")
          .attachment()
          .fallback("Required plain-text summary of the attachment.")
          .color("#0000cc")
          .authorName(payload.sender.login)
          .authorLink(payload.sender.html_url)
          .authorIcon(payload.sender.avatar_url)
          .title("Commit: " + commit.id)
          .titleLink(commit.url)
          .text(commit.message)
          .footer("Via: vhs-hookhub-github-nomos")
          .ts(Math.round(Date.parse(commit.timestamp) / 1000))
          .end();
      });
      break;
    default:
      slack_message = slack_message.text("We received a new '" + event_type + "' notification for '" + payload.repository.name + "', but we didn't know what to do with this event!");
      break;
  }

  return slack_message.json();
};