import { createYoga } from 'graphql-yoga'
import { createServer } from 'http'
import { schema } from './schema/schema'
import { createContext } from './context'

function main() {
  const yoga = createYoga({ schema, context: createContext })
  const server = createServer(yoga)
  server.listen(process.env.PORT, () => {
    console.info('Server is running on http://localhost:'+process.env.PORT+'/graphql')
  })
}
 
main()