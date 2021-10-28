const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const MonitorSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    monitor_ref : {
        type : String,
        required : true
    },  
    type : {
        type : String,
        required : true
    }    
}, { versionKey: false })



const MonitorModel = mongoose.model('Monitor', MonitorSchema);

module.exports = MonitorModel;