const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const NotificationTemplateSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    rules : {
        type : String,
    },
    category : {
        type : String,
        required : true,
    },
    header : {
        type : String,
        required : true,
    },
    body : {
        type : String,
        required : true,
    },
    
}, { versionKey: false })



const NotificationTemplateModel = mongoose.model('Notification template', NotificationTemplateSchema);

module.exports = NotificationTemplateModel;