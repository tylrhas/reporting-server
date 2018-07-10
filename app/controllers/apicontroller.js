var exports = module.exports = {}
//require api functions
lp_projects = require('./api/lp_projects');
lp_lbs = require('./api/lp_lbs');
client_time = require('./jobs/client_time');

var Sequelize = require("sequelize")
//Models
var db = require("../models");
const Op = Sequelize.Op

var Papa = require("papaparse")
var moment = require('moment')

//API Calls
exports.updatelpLbsapi = function (req, res) {
    lp_lbs.updateapi(req, res);
}
exports.updatelpprojectsapi = function (req, res) {
    lp_projects.updateProjectsapi(req, res);

}
exports.updatelptasksapi = function (req, res) {
    lp_tasks.updateAllTasks(req, res);
}

exports.test_view = function (req, res) {
    db.sequelize.query("SELECT * FROM test_view", { type: db.Sequelize.QueryTypes.SELECT })
        .then(data => {
            res.send(data);
        })
}
exports.at_risk_CSV = function (req, res) {

    var queryObject = {
        attributes: ['task_name', 'e_finish', 'deadline', 'project_id'],
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

        },
        include: [{
            attributes: ['project_name'],
            model: db.lp_project
        },
        {
            attributes: ['priority'],
            model: db.lp_project_priority,
            where: {
                [Op.or]: [
                    { index: 3 },
                    { index: null }
                ]
            }
        }],
        // order by priority
        order: [
            [db.lp_project_priority, 'priority', 'ASC']
        ]
    }

    if (req.query) {
        if (req.query.start_date && req.query.end_date) {
            queryObject.where.deadline = {
                [Op.not]: null,
                [Op.between]: [decodeURIComponent(req.query.start_date), decodeURIComponent(req.query.end_date)]
            }
        }
        else if (req.query.start_date) {
            queryObject.where.deadline = {
                [Op.not]: null,
                [Op.gte]: decodeURIComponent(req.query.start_date)
            }
        }
        else if (req.query.end_date) {
            queryObject.where.deadline = {
                [Op.not]: null,
                [Op.lte]: decodeURIComponent(req.query.end_date)
            }
        }
    }

    db.lp_task.findAll(queryObject).then(results => {
        results = results
        var flattenedJSON = []
        for (i = 0; i < results.length; i++) {
            if (results[i].lp_project != null) {
                var project = {
                    'task_name': results[i].task_name,
                    'e_finish': moment(results[i].e_finish).format('MM-DD-YYYY'),
                    'deadline': moment(results[i].deadline).format('MM-DD-YYYY'),
                    'project_id': results[i].project_id,
                    'project_name': results[i].lp_project.project_name,
                    'priority': results[i].lp_project_priorities[0].priority
                }
            }
            else {
                var project = {
                    'task_name': results[i].task_name,
                    'e_finish': moment(results[i].e_finish).format('MM-DD-YYYY'),
                    'deadline': moment(results[i].deadline).format('MM-DD-YYYY'),
                    'project_id': results[i].project_id,
                    'project_name': null,
                    'priority': results[i].lp_project_priorities[0].priority
                }
            }
            flattenedJSON.push(project)
        }
        //convert this to CSV 
        var CSV = Papa.unparse(flattenedJSON)
        console.log(CSV)
        res.send(CSV);
    })

}

exports.updateUser = function (req, res) {
    console.log(req.body)
    db.user.update({ user_group: req.body.group }, {
        where: {
            id: req.body.id,
        }
    }).then(results => {
        res.status(200)
    })
}
exports.getProject = function (req, res) {
    db.project_folders.find({
        where: { id: req.params.project_id },
        include: {
            model: db.project_folders,
            as: 'descendents',
            hierarchy: true
        }
    }).then(function (result) {
        res.send(result)
    })
}

exports.updateNsBacklog = function (req, res) {
    res.status(200)
    var updates = []
    var data = req.body.data
    for (i = 0; i < data.length; i++) {
        if (data[i]['Internal ID'] !== undefined) {
        let row = {
            id: data[i]['Internal ID'],
            location_name: null,
            total_mrr: data[i]['Total MRR'],
            gross_ps: data[i]['Gross Professional Services'],
            net_ps: data[i]['Net Professional Services'],
            total_ps_discount: data[i]['Total Professional Services Discount'],
            gross_cs: data[i]['Gross Creative Services'],
            net_cs: data[i]['Net Creative Services'],
            total_cs_discount: data[i]['Total Creative Services Discount']
        }
        if (data[i]['Location'].split(/\s(.+)/).length > 1) {
            row.location_name = data[i]['Location'].split(/\s(.+)/)[1]
        } else {
            row.location_name = data[i]['Location'].split(/\s(.+)/)[0]
        }
        
        updates.push(db.lbs.upsert(row).then(results =>{
            console.log(results)
        }))
    }
    }
    // db.lbs.bulkCreate(update)
    // .then(results => {
    //     console.log(results)
    //     res.status(200)
    // })
    Promise.all(updates).then(() =>{
        res.status(200)
    })
}