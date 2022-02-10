const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const VerifyEmailSchema = new Schema({
    email : {
        type : String,
        required : true
    },
    otp : {
        type : String,
        required : true,
    },

    createdAt: { type: Date, expires: 300 },

}, { versionKey: false })



const VerifyEmailModel = mongoose.model('Email verification code', VerifyEmailSchema);

module.exports = VerifyEmailModel;