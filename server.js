const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const bodyParser = require('body-parser');
const cors = require("cors");
const runMiddleware = require('run-middleware');

const routes = require("./routes/auth_routes");
const secure_routes = require("./routes/secure_routes");
const team_routes = require("./routes/team_routes");
const team_secret_routes = require("./routes/team_secret_routes");
const device_routes = require("./routes/device_routes");
const device_group_routes = require("./routes/device_group_routes");
const analytic_group_routes = require("./routes/analytic_group_routes");
const monitor_routes = require("./routes/monitor_routes");
const agent_routes = require("./routes/agent_routes");
const user_routes = require("./routes/user_routes");
const notif_routes = require("./routes/notification_template_routes");
const notification_routes = require("./routes/notification_routes");

const { WebSocketServer } = require('ws');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { webSocketRecievedJSON } = require('./helpers/plans');
const { emitNotification } = require('./helpers/monitors');
const url = require('url');
const { newAgent, removeAgent } = require('./helpers/websocket');


const { Server } = require('ws');



mongoose.connect(
    "mongodb+srv://admin:admin@cluster0.t2yk1.mongodb.net/iManage_central_db?retryWrites=true&w=majority",
    {
        useNewUrlParser : true,
        useUnifiedTopology : true
    }
);

mongoose.set("useCreateIndex", true);

mongoose.connection.on('error', (err) => {
  console.log(err);
})

mongoose.Promise = global.Promise;

require('./auth/auth');


var app = express();


runMiddleware(app);
app.use(cors({ credentials: true }))
app.options('*', cors());
app.use(express.json());
// app.use(bodyParser.json()); // <--- Here
app.use(bodyParser.urlencoded({
   extended: true
}));

app.use('/', routes);

app.use('/secure', passport.authenticate('jwt', { session : false }) ,secure_routes);
app.use('/teams', passport.authenticate('jwt', { session : false }) ,team_routes);
app.use('/team_secrets', passport.authenticate('jwt', { session : false }) ,team_secret_routes);
app.use('/devices', passport.authenticate('jwt', { session : false }) ,device_routes);
app.use('/device_groups', passport.authenticate('jwt', { session : false }) ,device_group_routes);
app.use('/analytic_groups', passport.authenticate('jwt', { session : false }) ,analytic_group_routes);
app.use('/monitors', passport.authenticate('jwt', { session : false }) ,monitor_routes);
app.use('/agents', passport.authenticate('jwt', { session : false }) ,agent_routes);
app.use('/notifs', passport.authenticate('jwt', { session : false }) ,notif_routes);
app.use('/notifications', passport.authenticate('jwt', { session : false }) ,notification_routes);
app.use('/users', passport.authenticate('jwt', { session : false }) ,user_routes);

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    // console.log(err)
    res.json({error : err});
})
// // Add headers before the routes are defined
// app.use(function (req, res, next) {

//   // Website you wish to allow to connect
//   res.setHeader('Access-Control-Allow-Origin', '*');

//   // Request methods you wish to allow
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

//   // Request headers you wish to allow
//   res.setHeader('Access-Control-Allow-Headers', '*');

//   // Set to true if you need the website to include cookies in the requests sent
//   // to the API (e.g. in case you use sessions)
//   res.setHeader('Access-Control-Allow-Credentials', true);

//   // Pass to next layer of middleware
//   next();
// });

// app.listen(process.env.PORT || 3001, () => {
//   console.log("Server initiated at port : " + (process.env.PORT || 3001))
// })

const httpsServer = https.createServer({
  // key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
  // cert: fs.readFileSync(path.join(__dirname, 'cert', 'cert.pem')),

  key: fs.readFileSync(path.join(__dirname, 'imanage_host_key', 'imanage_host_key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'imanage_host_key', 'imanage_host.crt')),
  ca: [
    fs.readFileSync(path.join(__dirname, 'imanage_host_key', 'imanage_host.ca-bundle'))
  ]
}, app)

const httpServer = http.createServer(app)



const wss = new WebSocketServer({server : httpsServer});

// console.log(wss)
wss.on('connection', (ws, req) => {
  newAgent(req, ws)
  ws.on('message', function incoming(message) {
    // console.log('received: %s', webSocketRecievedJSON(message));
    const received_message =  webSocketRecievedJSON(message);
    if(received_message.hasOwnProperty("api_path") && received_message.api_path == "notification_alert"){
      emitNotification(received_message);
    }

  });
  // ws.send('[+] Connection established');
  ws.on('close', () => {
    removeAgent(req);
  })
})

httpsServer.listen(process.env.PORT || 3001, () => {
  console.log("HTTPS Server initiated at port : " + (process.env.PORT || 3001))
})

httpServer.listen(3002, () => {
  console.log("HTTP Server initiated at port : " + (process.env.PORT || 3001))
})
