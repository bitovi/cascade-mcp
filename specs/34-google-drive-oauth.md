


We are going to support both an API key and OAuth for GoogleDrive (similar to how we do for Figma and Atlassian)


here's figma server/providers/figma/index.ts


server/provider-server-oauth/

server/atlassian-auth-code-flow.ts




Google drive will need to configure both:

- OAuth provider
- And a client "fetcher"


The first helper we want to make work is (simple "whoami" request).


