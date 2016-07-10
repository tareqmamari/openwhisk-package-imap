IMAP Openwhisk Package
==========================
[![Build Status](https://travis-ci.org/tareqmamari/openwhisk-package-imap.svg?branch=master)](https://travis-ci.org/tareqmamari/openwhisk-package-imap)

This package contains an imap events provider as well as a feed that allows openwhisk users to register for incoming emails notifications through imap protocol.

![Overall Architecture](images/architecture.png?raw=true "Overall Architecture")

##How to install and uninstall this package ?
Install the package using `./install.sh  $EDGE_HOST $AUTH_KEY $WSK_CLI`
where :
- **$EDGE_HOST** is where openwhisk API host
- **$AUTH_KEY** is the authentication key
- **$WSK_CLI** is the path of Openwhisk command interface binary

To uninstall the package, please use `./uninstall.sh  $EDGE_HOST $AUTH_KEY $WSK_CLI` 

##Package contents
| Entity | Type | Parameters | Description |
| --- | --- | --- | --- |
| `/namespace/imap` | package | host,username,password | Openwhisk Package Template |
| `/namespace/imap/imapFeed` | action | [details](#imapFeed) | A simple hello world action |

###Feeds
####imapFeed
`/namespace/imap/imapFeed` is a feed action that allow users to register for incoming emails through IMAP protocol.  
######Parameters
| **Parameter**     | **Type** | **Required** | **Binding Time** | **Description**| **Options** | **Default** | **Example** |
| ------------- | ---- | -------- | ------------ | ------- | ------- | ------- |------- |
| host | *string* | yes | yes |  IMAP server endpoint | - | - | "imap.gmail.com" |
| username | *string* | yes | yes | IMAP username| - | - |"YYYYYYY" |
| password | *string* | yes | yes | IMAP password| - | - |"XXXXXXX" |
| mailbox | *string* | yes | yes | IMAP mailbox | - | - |"INBOX" |

######Usage
To use this action, you need to pass the required parameters (refer to the table above)
```bash
wsk trigger create imapTrigger -p user 'almaamaritest@gmail.com' -p pass 'XXXX' -p host 'imap.gmail.com' -p mailbox 'INBOX' --feed imapFeed
```

## Contributing
Please refer to [CONTRIBUTING.md](CONTRIBUTING.md)

## License
Copyright 2015-2016 IBM Corporation

Licensed under the [Apache License, Version 2.0 (the "License")](http://www.apache.org/licenses/LICENSE-2.0.html).

Unless required by applicable law or agreed to in writing, software distributed under the license is distributed on an "as is" basis, without warranties or conditions of any kind, either express or implied. See the license for the specific language governing permissions and limitations under the license.
