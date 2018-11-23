
var url  = require("url")
var http = require("http")
var assert = require("assert")
var express = require("express")
var bodyParser = require("body-parser")

var ObjectId = require('mongodb').ObjectID
var MongoClient = require('mongodb').MongoClient

var config = require("./config.json")

var db
var mongodbURL = config.mongodbURL

app = express()
app.set("view engine", "ejs")
app.use(bodyParser.urlencoded({ extended: false }))

MongoClient.connect(mongodbURL, function(err, database) {
    if(err) throw err
    db = database
    app.listen(8080)
    console.log("Listening on port 8080")
})

// Initialize connection once

app.get("/", function(req, res) {
    res.render("index.ejs")
})

app.get("/restaurants", function(req, res) {
	var restaurants = []
    db.collection("restaurants").find({}, {restaurantName: 1}, function(err, docs) {
        docs.each(function(err, doc) {
            if (err) throw err
            if(doc) {
    			restaurants.push(doc)
            } else {
                res.render("display_restaurants.ejs", {restaurants: restaurants})
            }
        })
    })
})

app.get("/restaurantInfo/:id", function(req, res) {
	var restaurants = []
    db.collection("restaurants").find({"_id": ObjectId(req.params.id)}, function(err, docs) {
        docs.each(function(err, doc) {
            if (err) throw err
            if(doc) {
    			restaurants.push(doc)
            } else {
                res.render("restaurant_info.ejs", {restaurant: restaurants[0]})
            }
        })
    })
})

app.get("/delete", function(req, res) {
	var restaurants = []
    db.collection("restaurants").find({}, {restaurantName: 1}, function(err, docs) {
        docs.each(function(err, doc) {
            if (err) throw err
            if(doc) {
    			restaurants.push(doc)
            } else {
                res.render("delete_restaurants.ejs", {restaurants: restaurants})
            }
        })
    })
})

app.get("/deleteOne/:id", function(req, res) {
    db.collection("restaurants").deleteOne({"_id": ObjectId(req.params.id)}, function(err, obj) {
        if (err) throw err
        res.render("index.ejs")
    })
})

app.get("/insertOne", function(req, res) {
    var object = {restaurantName: 'OU Club2', borough: 'Hong Kong', cuisine: 'Hong Kong',
                street: '30 Good Stepherd Street', building: 'Main Campus', zipcode: '852',
                lat: '22.3160666', lng: '114.1802052', owner: 'matthew' }

    db.collection("restaurants").insertOne(object, function(err, doc) {
        if (err) throw err
        res.send("inserted")
    })
})

app.get("/search", function(req, res) {
    res.render("search.ejs")
})

app.post("/searchRestaurant", function(req, res) {
    var { restName } = req.body
    var restaurants = []

    db.collection("restaurants").find({restaurantName: restName}, function(err, docs) {
        docs.each(function(err, doc) {
            if (err) throw err
            if(doc) {
    			restaurants.push(doc)
            } else {
                res.render("display_restaurants.ejs", {restaurants: restaurants})
            }
        })
    })
})
