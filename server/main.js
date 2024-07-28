
const { MongoClient, ServerApiVersion } = require('mongodb');
const axios = require('axios');
require('dotenv').config();
const uri = process.env.MONGODB_CONNECTION_STRING;
const hfToken = process.env.HF_TOKEN;
const embeddingUrl = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2'
const TOTAL_REQUESTS = 21349;
const BASE_INTERVAL_MS = 1000; // Base interval in milliseconds (1 second)
const MAX_INTERVAL_MS = 60000; // Max interval in milliseconds (1 minute)

let currentRequestCount = 0;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
    //   strict: true,
      deprecationErrors: true,
    }
  });

async function generateEmbedding(text) {
    try {
        const response = await axios.post(
            embeddingUrl, 
            {inputs: text},
            {headers: {
                "Authorization": `Bearer ${hfToken}`, 
                "Content-Type": "application/json"
            }}
        );

        if (response.status != 200) {
            throw new Error(`Request failed with status code ${response.status} :
                ${response.data}`);
        }

        return response.data;
    } catch (error) {
        console.error(error);
    }

}

/* This function connects to the database, gets the first 50 movies, embeds their
    plots and saves the embedding to the database
*/
async function save_embeddings() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('sample_mflix');
    const collection = db.collection('movies');

    const docs = await collection.find({'plot': {'$exists': true}}).limit(50).toArray();

    // loop over each doc, embed, and replace curr doc with embedded doc
    // function exponentialBackoff(interval) {
    //     setTimeout(() => {
    //         if (currentRequestCount < TOTAL_REQUESTS) {
    //             sendRequest();
    //             currentRequestCount++;
    //             let nextInterval = interval * 2;
    //             if (nextInterval > MAX_INTERVAL_MS) {
    //                 nextInterval = MAX_INTERVAL_MS;
    //             }
    //             exponentialBackoff(nextInterval);
    //         }
    //     }, interval);
    // }
    
    // exponentialBackoff(BASE_INTERVAL_MS);
    for (let doc of docs) {
        // setTimeout(async () => {
            if (!doc.plot_embedding_hf) {
                doc.plot_embedding_hf = await generateEmbedding(doc.plot);
                await collection.replaceOne({'_id': doc._id}, doc);
                console.log(`updated ${doc._id}`)
            }
        // }, 1000)
        
    }

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    console.log('closing connection . . . :( ')
    await client.close();
  }
}
// save_embeddings().catch(console.dir);


/* This function queries the vector store
*/
async function queryEmbeddings(query) {
    try {
        await client.connect();
        const db = client.db("sample_mflix");
        const collection = db.collection("movies");

        results = await collection.aggregate([
            {
                $search: {
                    index: "PlotSemanticSearch",
                    knnBeta: {
                        vector: await generateEmbedding(query),  // generate embedding of the user's query
                        path: "plot_embedding_hf",
                        k: 4  // return top 4 results
                    }
                },
            },
            {
                $project: {
                    _id: 0,
                    title: 1,
                    plot: 1,
                },
            }
        ]).toArray();

        console.log(
            `Here are the top 4 results for your search: \n 
            1. ${results[0].title} | Plot: ${results[0].plot}\n 
            2. ${results[1].title} | Plot: ${results[1].plot}\n 
            3. ${results[2].title} | Plot: ${results[2].plot}\n 
            4. ${results[3].title} | Plot: ${results[3].plot}\n 
            `
        );
    } finally {
        console.log("closing connection . . . :((");
        await client.close();
    }
}

const query = "a girl discovering herself";
queryEmbeddings(query).catch(console.dir);
