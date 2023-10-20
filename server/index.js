import express from 'express'
import morgan from 'morgan'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'
dotenv.config()
const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {},
})

const db = createClient({
    url: process.env.DATABASE_URL ?? '',
    authToken: process.env.DATABASE_AUTH_TOKEN ?? '',
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        user TEXT,
        avatar TEXT
    )
`)

io.on('connection', async (socket) => {
    console.log('New user connected')
    socket.on('disconnect', () => {
        console.log('an user has disconnected')
    })

    // En este código se captura el mensaje enviado por 1 usuario escuchando el evento 'chat message' que creamos
    // esto quiere decir que en el cliente se envió un mensaje con el evento 'chat message'
    socket.on('chat message', async (msg) => {
        let result
        const { username, avatar } = socket.handshake.auth
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user, avatar) VALUES (:message, :username, :avatar)',
                args: { message: msg, username, avatar },
            })
        } catch (error) {
            console.error(error)
            return
        }

        // Este código envía el mensaje al resto de usuarios conectados
        // cabe saber que cuando se usa io, por convención estámos enviando el mensaje a todos los usarios conectados
        io.emit('chat message', msg, result.lastInsertRowid.toString(), username, avatar)
    })

    if (!socket.recovered) {
        try {
            const result = await db.execute({
                sql: 'SELECT id, content, user, avatar FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0],
            })

            result.rows.forEach((row) => {
                socket.emit(
                    'chat message',
                    row.content,
                    row.id.toString(),
                    row.user,
                    row.avatar
                )
            })
        } catch (e) {
            console.error(e)
            return
        }
    }
})

app.use(morgan('dev'))

app.get('/', (req, res) => {
    res.sendFile(`${process.cwd()}/client/index.html`)
})

server.listen(port, () => {
    console.log('Server is running on port 3000')
})
