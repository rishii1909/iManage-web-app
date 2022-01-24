const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const UserModel = require('../models/User');
const TeamModel = require('../models/Team');
const AgentModel = require('../models/Agent')
const NotificationTemplateModel = require('../models/NotificationTemplate');
const TeamSecretModel = require('../models/TeamSecret');
const JWTstrategy = require('passport-jwt').Strategy;
const ExtractJWT = require('passport-jwt').ExtractJwt;

const cloud_agent_id = "61a35d2722fd3300162c2bb1";
const default_template_id = "";

passport.use(
    'register',
    new localStrategy({
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true
    },
    async (req, email, password, done) => {
        try {

            UserModel.findOne({
                email: req.body.email,
            }).then( async (user) => {
                if(user) return handle_error("An account for this email already exists.")

                if(!req.body.team_secret){
                    var user = await UserModel.create(req.body);
                    let teamData = {};
                    teamData.name = `${user.name.trim().split(" ")[0]}'s team`;
                    teamData.root = user._id;
                    teamData.level = 0;
                    teamData.capacity = 1;
                    teamData.users = [user._id]
                    const team = await TeamModel.create(teamData);
                    await UserModel.updateOne({
                        _id: user._id
                    }, {
                        team_id: team._id
                    },
                    (err) => {
                       if(err){
                           console.log(`Error: ` + err)
                       }
                    });
                    
                    const template = await NotificationTemplateModel.create({
                        name : "iManage Default template",
                        header : "<%Monitor%> Alert",
                        body : "Monitor status has changed to <%Status%>.\n Advisory to check the resource. \n<%EventDT%>"
                    });
                    console.log(template);
                    if(template){
                        UserModel.findOneAndUpdate({
                            _id: user._id,
                        }, {
                            $push : { notification_templates : template._id.toString()},
                        },
                        (err, doc) => {
                            if(err) console.log(err);
                        });
                    }
    
                    await TeamModel.findByIdAndUpdate(
                        {_id : team._id}, 
                        {
                            $push : { [`user_agents.${user._id}`] : cloud_agent_id },
                            $inc : { agent_occupancy : 1 }
                        },
                        )
                    req.body.created_data = {
                        user : user,
                        team : team
                    }
                    return done(null, {
                        user : user,
                        team : team
                    });
                }else{
                    // Using Team secret
    
                    TeamSecretModel.findOne({
                        secret: req.body.team_secret,
                    }).then(async (secret) => {
                        if(!secret){
                            console.log(secret);
                            return done("Your team secret is invalid.");
                        }
                        var user = await UserModel.create({...req.body, ...{team_id : secret.team_id}});
                        console.log("secret team id", secret.team_id)
                        TeamModel.findOneAndUpdate({
                            _id: secret.team_id,
                        }, {
                            $push : {
                                users : user._id,
                            },
                            $push : { [`user_agents.${user._id}`] : cloud_agent_id },
                            $inc : { user_occupancy : 1 }
                        }, (err, team) => {
                            console.log(team._id);
                            if (err) {
                                console.log(`Error: ` + err)
                            } else {
                                req.body.created_data = {
                                    user : user,
                                    team : team
                                }
                                return done(null, {
                                    user : user,
                                    team : team
                                });
                            }
                        });
                        
                    });
                }

            });
            
            
        } catch (err) {
            console.log(err);
            done(err);
        }
    }
    )
)

passport.use(
    'login',
    new localStrategy(
        {
            usernameField : 'email',
            passwordField : 'password',
        },
        async ( email, password, done) => {
            try {
                const User = await UserModel.findOne({email})
                // if(User.notifications){
                //     User.notifications = User.notifications.filter(notif => notif != null);
                //     User.save;
                // }
                const valid_password = await User.check_password(password);
                const Team = await TeamModel.findById({_id : User.team_id});
                User.pro = Team.level > 0;
                if( !User || !valid_password ){
                    return done(
                        null,
                        false,
                        "Incorrect username or password."
                    );
                }
                return done(
                    null,
                    User,
                    "Logged in successfully!"
                )

            } catch (err) {
                done(err);
            }
        }
    )
)

passport.use(
    new JWTstrategy({
        secretOrKey : 'iManage-secret-key',
        // jwtFromRequest : ExtractJWT.fromUrlQueryParameter('auth_token')
        jwtFromRequest : ExtractJWT.fromAuthHeaderAsBearerToken(),
    },
    async (token, done) => {
        try {
            return done(null, token.user)
        } catch (err) {
            return done(err);
        }
    }
    )
)