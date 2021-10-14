const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const UserModel = require('../models/User');
const JWTstrategy = require('passport-jwt').Strategy;
const ExtractJWT = require('passport-jwt').ExtractJwt;

passport.use(
    'register',
    new localStrategy({
        usernameField : 'email',
        passwordField : 'password',
    },
    async (email, password, done) => {
        try {
            const user = await UserModel.create({email, password});
            console.log("user info returned  :", user);
            return done(null, user);
        } catch (err) {
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
                const valid_password = await User.check_password(password);
                if( !User || !valid_password ){
                    console.log('here');
                    return done(
                        null,
                        false,
                        {
                            message : "Incorrect username or password."
                        }
                    );
                }
                return done(
                    null,
                    User,
                    {
                        message : "Logged in successfully!"
                    }
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