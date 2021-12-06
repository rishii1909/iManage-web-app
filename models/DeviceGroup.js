const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const DeviceGroupSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    devices : [{
        type : mongoose.Schema.ObjectId,
        ref : "Device",
        unique : true

    }],
    analytic_groups : [{
        type : mongoose.Schema.ObjectId,
        ref : "MonitorGroup",
        unique : true

    }],

}, { versionKey: false })



const DeviceGroupModel = mongoose.model('DeviceGroup', DeviceGroupSchema);

module.exports = DeviceGroupModel;