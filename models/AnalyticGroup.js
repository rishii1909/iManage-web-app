const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const MonitorGroupSchema = new Schema({
    name : {
        type : String,
        required : true,
    },
    monitors : {
        type : Map,
        required : true,
        default : {},
    }
}, { versionKey: false })



const MonitorGroupModel = mongoose.model('MonitorGroup', MonitorGroupSchema);

module.exports = MonitorGroupModel;