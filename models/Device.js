const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const DeviceSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
        required : true
    },
    snmp : {
        type : Number,
        required : true,
    },
    community_string : {
        type : String,
        required : true,
        default : "public"
    },
    type : {
        type : Number,
        required : true,
        default : 1
    },
    username : {
        type : String,
        // required : true,
    },
    host : {
        type : String,
        // required : true,
    },
    creds : {
        type : Schema.Types.Mixed,
        // required : true
    },
    monitors : {
        type : Map,
        default : {}
    },    
    private : {
        type : Boolean,
        default : false
    },
    assigned_devices : [{
        type : mongoose.Schema.ObjectId,
        ref : "User",
    }],
}, { versionKey: false })



const DeviceModel = mongoose.model('Device', DeviceSchema);

module.exports = DeviceModel;