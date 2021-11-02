const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const DeviceGroupSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    devices : {
        type : Map,
        required : true,
        default : {},
    }
}, { versionKey: false })



const DeviceGroupModel = mongoose.model('DeviceGroup', DeviceGroupSchema);

module.exports = DeviceGroupModel;