const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const bodyParser = require('body-parser');

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

const routes = require("./routes/routes");
const secure_routes = require("./routes/secure_routes");

const app = express();

app.use(bodyParser.urlencoded({extended : false}));
app.use('/', routes);


app.use('/', routes);

app.use('/secure', passport.authenticate('jwt', { session : false }) ,secure_routes);

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    // console.log(err)
    res.json({error : err});
})

app.listen(3000, () => {
  console.log("Server initiated.")
})