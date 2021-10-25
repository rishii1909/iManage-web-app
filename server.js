const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const bodyParser = require('body-parser');
const cors = require("cors");
const UserModel = require('./models/User');

mongoose.connect(
    "mongodb+srv://admin:admin@cluster0.8nqge.mongodb.net/imanage_auth?retryWrites=true&w=majority",
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

const routes = require("./routes/auth_routes");
const secure_routes = require("./routes/secure_routes");
const team_routes = require("./routes/team_routes");
const team_secret_routes = require("./routes/team_secret_routes");
const device_routes = require("./routes/device_routes");
const agent_routes = require("./routes/agent_routes");
const user_routes = require("./routes/user_routes");

const app = express();
app.use(cors({ credentials: true }))
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
app.use('/devices', passport.authenticate('jwt', { session : false }) ,agent_routes);
app.use('/users', passport.authenticate('jwt', { session : false }) ,user_routes);

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    // console.log(err)
    res.json({error : err});
})
// Add headers before the routes are defined
app.use(function (req, res, next) {

  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', '*');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

app.listen(3001, () => {
  console.log("Server initiated.")
})