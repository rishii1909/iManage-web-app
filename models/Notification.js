const mongoose = require('mongoose');

const Schema = mongoose.Schema;


const NotificationSchema = new Schema({
    header : String,
    body : String,
    previous_monitor_status : Number,
    current_monitor_status : Number,
    monitor_ref : String,
    top : String,
    is_binary : Boolean

}, { versionKey: false })



const NotificationModel = mongoose.model('Notification', NotificationSchema);

module.exports = NotificationModel;
