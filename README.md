# IMAP service provider
This project is a service provider to enable receiving new email through IMAP protocol.

## Info:
- 100% Nodejs
- Deployed in bluemix as a CF Nodejs application.

## Usage
  - The service is deployed in `http://imapserviceprovider.mybluemix.net`. To use it within Openwhisk, you will need to use a feed action to create a trigger through it.
  - The feed action is available as a public action within my namespace: `/talmaam@de.ibm.com_mainSpace/imapFeed`.
  - Create trigger and pass the needed parameters:
    `wsk trigger create imapTrigger -p user 'EMAIL' -p pass 'PASSWORD' -p host 'HOST' -p mailbox 'MAILBOX' --feed imapFeed`

Example:
  
  `wsk trigger create imapTrigger -p user 'almaamaritest@gmail.com' -p pass 'XXXX' -p host 'imap.gmail.com' -p mailbox 'INBOX' --feed imapFeed`

