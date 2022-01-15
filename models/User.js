const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Schema = mongoose.Schema;

const UserSchema = new Schema({
    email : {
        type : String,  
        required : true,
        // unique : true
    },
    name : {
        type : String,
        required : true,
    },
    password : {
        type : String,
        required : true,
    },
    team_id : {
        type : Schema.Types.ObjectId,
        ref : 'Team',
    },
    notification_templates : {
        type : Array,
        default : [],
    },
    dashboard_level_3 : {
        type : Schema.Types.Mixed,
        default : {
            two_states : {},
            three_states : {}
        }
    },
    notifications : [{
        type : Schema.Types.ObjectId,
        ref : "Notification"
    }]


}, { versionKey: false })

UserSchema.pre(
    'save',
    async function(next){
        var self = this;
        const hash = await bcrypt.hash(self.password, 10);
        this.password = hash;
    next();
    }
)

UserSchema.methods.check_password = async function(password){
  const user = this;
  const compare = await bcrypt.compare(password, user.password);
  return compare;
}

const UserModel = mongoose.model('User', UserSchema);

module.exports = UserModel;