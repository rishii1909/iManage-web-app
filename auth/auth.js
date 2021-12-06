const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const UserModel = require('../models/User');
const TeamModel = require('../models/Team');
const AgentModel = require('../models/Agent')
const TeamSecretModel = require('../models/TeamSecret');
const JWTstrategy = require('passport-jwt').Strategy;
const ExtractJWT = require('passport-jwt').ExtractJwt;

const cloud_agent_id = "61a35d2722fd3300162c2bb1";


passport.use(
    'register',
    new localStrategy({
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true
    },
    async (req, email, password, done) => {
        try {
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
                console.log(team._id)
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
                    await TeamModel.findOneAndUpdate({
                        _id: secret.team_id,
                    }, {
                        $push : {
                            users : user._id,
                        },
                        $push : { [`user_agents.${user_id}`] : cloud_agent_id },
                        $inc : { agent_occupancy : 1 }
                    }, (err, team) => {
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