const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const ForgotOTPSchema = new Schema({
    user_id : {
        type : Schema.Types.ObjectId,
        ref : "User"
    },
    otp : {
        type : String,
        required : true,
    },

    createdAt: { type: Date, expires: 300 },

}, { versionKey: false })



const ForgotOTPModel = mongoose.model('Forgot password OTP', ForgotOTPSchema);

module.exports = ForgotOTPModel;