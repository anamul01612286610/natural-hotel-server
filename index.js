const express = require('express')
const app = express()
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// MIDDLEWERE
app.use(cors())
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId, } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@atlascluster.i5gb7ai.mongodb.net/?appName=AtlasCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const usersCollection = client.db("naturalDB").collection("users");
    const menuCollection = client.db("naturalDB").collection("menu");
    const reviewsCollection = client.db("naturalDB").collection("reviews");
    const cartCollection = client.db("naturalDB").collection("cart");
    const paymentsCollection = client.db("naturalDB").collection("payments");

    // JWT Related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token });
    })

    //   jwt   middlewares 
    const verifyToken = (req, res, next) => {
      console.log('inside verify Token', req.headers)
      if (!req.headers.authorization) {
        return res.status(401).send({ massage: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ massage: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
      })

    }
    //  use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query)
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ massage: 'forbidden access' });
      }
      next();
    }


    // users related
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      if (email !== req.decoded.email) {
        return res.status(403).send({ massage: 'unauthorized access' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      // ! insert email if user doesn't exists:
      // !you can  do this many ways (1.email unique ,2.upsert,3.simple checking)
      const query = { email: user.email }
      const existingUsee = await usersCollection.findOne(query)
      if (existingUsee) {
        return res.send({ massage: "user already exists", insertedId: null })
      }

      const result = await usersCollection.insertOne(user)
      res.send(result)

    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query)
      res.send(result)
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filler = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filler, updateDoc)
      res.send(result)
    })

    // menu related// reviews related
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray()
      res.send(result)
    })
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray()
      res.send(result)
    })
    // carts collection
    app.get('/cart', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/cart', async (req, res) => {
      const cartItems = req.body;
      const result = await cartCollection.insertOne(cartItems)
      res.send(result)
    })

    app.delete('/cart/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result)

    })

    // create payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']

      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    })


    // payments related api
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment)
      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id) ) } }
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({result: insertResult, deleteResult})
    })
    
    app.get('/admin-stats' , async(req,res)=>{
      const users = await usersCollection.estimatedDocumentCount();
      const product = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();
      const payments = await paymentsCollection.find().toArray();
      const revenue = payments.reduce((sum, payment)=> sum + payment.price,0)

      res.send({
        revenue,
        users,
        product,
        orders
      })
    })
  



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('natural hotel')
})

app.listen(port, () => {
  console.log(`Example  in  natural project ${port}`)
})
