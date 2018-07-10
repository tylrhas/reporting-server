var Sequelize = require("sequelize")
const Op = Sequelize.Op
//Models
var db = require("../models")
var moment = require('moment');

module.exports = function (app, passport) {
    app.get('/reports/at-risk-projects', checkAuthentication, function (req, res) {
        db.lp_project.findAll({
            attributes: ['project_name'],
            include: [{
                attributes: ['task_name', 'e_finish', 'deadline', 'project_id'],
                model: db.lp_task,
                where: {
                    'deadline': {
                        [Op.not]: null
                    },
                    'date_done': null,
                    'e_finish': {
                        [Op.gt]: Sequelize.col('deadline')
                    },
                    [Op.or]: [{
                        'task_name': {
                            [Op.like]: '%Activation%'
                        }
                    },
                    {
                        'task_name': {
                            [Op.like]: '%Launch%'
                        }
                    }
                    ]

                }
            },
            {
                attributes: ['project_id', 'priority', 'index'],
                model: db.lp_project_priority,
                where: {
                    [Op.or]: [
                        { index: 3 },
                        { index: null }
                    ]
                }
            }],
            // //order by priority
            order: [
                [db.lp_project_priority, 'priority', 'ASC']
            ]
        }).then(results => {
            console.log(results)
            // send over the projects lp_space_id to create links on page and moment to change the date 
            res.render('pages/at_risk_projects', { user: req.user, projects: results, lp_space_id: process.env.LPWorkspaceId, moment: moment, slug: 'at-risk-projects' });
        })
    })

    app.get('/reports/active-projects', checkAuthentication, function (req, res) {
        db.lp_project.findAll({
            attributes: ['project_name', 'expected_finish', 'id'],
            where: {
                is_done: false,
                expected_finish: {
                    [Op.not]: null
                }

            },
            include: [
                {
                    attributes: ['project_id', 'priority', 'index'],
                    model: db.lp_project_priority,
                    where: {
                        [Op.or]: [
                            { index: 3 },
                            { index: null }
                        ]
                    }
                }],
            // //order by priority
            order: [
                [db.lp_project_priority, 'priority', 'ASC']
            ]
        }).then(results => {
            console.log(results)
            // send over the projects lp_space_id to create links on page and moment to change the date 
            res.render('pages/active_projects', { user: req.user, projects: results, lp_space_id: process.env.LPWorkspaceId, moment: moment, slug: 'active-projects' });
        })
    })
    app.get('/reports/deadline-passed', function (req, res) {
        db.lp_task.findAll({
            attributes: ['id', 'task_name', 'deadline'],
            where: {
                date_done: null,
                e_finish: {
                    [Op.not]: null
                },
                deadline: {
                    [Op.lt]: moment().format('YYYY-MM-DD')

                }
            },
            include: [
                {
                    attributes: ['project_name', 'id'],
                    model: db.lp_project
                    ,
                    where: {
                        is_done: {
                            [Op.not]: true
                        }
                    }
                }],
            // order by deadline
            order: [
                ['deadline', 'ASC']
            ]
        }).then(results => {
            console.log(results)
            // send over the projects lp_space_id to create links on page and moment to change the date 
            res.render('pages/deadline_passed', { user: req.user, tasks: results, lp_space_id: process.env.LPWorkspaceId, moment: moment, slug: 'deadline-passed' });
            // res.json(results)
        })
    })
    app.get('/reports/activations/:month/:year', function (req, res) {
        //  get the first and last day of the month
        var first = new Date(req.params.year, req.params.month, 1);
        var last  = new Date(req.params.year, req.params.month + 1, 0);
        // get all locations that have been launched in the month and year
        // db.lbs.findAll({
        //     attributes: ['location_name', 'total_mrr', 'gross_ps', 'net_ps', 'total_ps_discount', 'gross_cs', 'net_cs',  'total_cs_discount'],
        //     include: [{
        //         attributes: ['task_name', 'e_finish', 'deadline', 'project_id'],
        //         model: db.project_folders,
        //         where: {
        //             'date_done': null,
        //             'e_finish': {
        //                 [Op.gt]: Sequelize.col('deadline')
        //             },
        //             [Op.or]: [{
        //                 'task_name': {
        //                     [Op.like]: '%Activation%'
        //                 }
        //             },
        //             {
        //                 'task_name': {
        //                     [Op.like]: '%Launch%'
        //                 }
        //             }
        //             ]

        //         }
        //     },
        //     {
        //         attributes: ['project_id', 'priority', 'index'],
        //         model: db.lp_project_priority,
        //         where: {
        //             [Op.or]: [
        //                 { index: 3 },
        //                 { index: null }
        //             ]
        //         }
        //     }],
        //     // //order by priority
        //     order: [
        //         [db.lp_project_priority, 'priority', 'ASC']
        //     ]
        // })
    })

    function isAdmin(req, res, next){
        if (req.isAuthenticated() && req.user.user_group == 'admin'){
        
                   return next();
    
            }
            else{
                res.redirect('/');
            }
       }
    function checkAuthentication (req, res, next) {
        if (req.isAuthenticated()) {
            // if user is looged in, req.isAuthenticated() will return true
            next()
        } else {
            res.redirect('/g5_auth/users/auth/g5')
        }
    }
}
