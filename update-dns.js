const axios = require('axios');
const Promise = require('bluebird');
const AWS = require('aws-sdk');
const route53 = new AWS.Route53();
const fs = require('fs');

const fileName = process.argv[2];
const records = JSON.parse(fs.readFileSync(fileName).toString('utf8'));

const recordType = 'A';
const ttl = 60;

function ipAddressIsValid(ipAddrString) {
    const ipBlocks = ipAddrString.split('.');
    const invalidIp = ipBlocks.some((block) => {
        return (block < 0 || block > 255);
    });

    return !invalidIp;
}

async function getCurrentIpAddress() {
    const response = await axios.get('https://checkip.amazonaws.com/');
    return response.data.replace(/[\n\t\r]/g,"");
}

async function getRoute53IpAddr(hostedZoneId, name) {

    const params = {
        HostedZoneId: hostedZoneId
    };

    const response = await route53.listResourceRecordSets(params).promise();
    const { ResourceRecordSets } = response;
    const recordSet = ResourceRecordSets.find((record) => record.Name === name && record.Type === recordType);
    return recordSet.ResourceRecords[0].Value;

}

async function changeResourceRecordSets(hostedZoneId, ipAddr, name) {

    const params = {
        ChangeBatch: {
            Comment: 'Updated From DDNS Node Script',
            Changes: [{
                Action: 'UPSERT',
                ResourceRecordSet: {
                    ResourceRecords: [{ Value: ipAddr }],
                    Name: name,
                    Type: recordType,
                    TTL: ttl
                }
            }]
        },
        HostedZoneId: hostedZoneId,
    };

    return await route53.changeResourceRecordSets(params).promise();
}

async function updateDNSRecords(records) {

    const currentIpAddress = await getCurrentIpAddress();

    Promise.each(records, async (record) => {

        const { hostedZoneId, name } = record;

        const route53IpAddress = await getRoute53IpAddr(hostedZoneId, name);

        if (currentIpAddress !== route53IpAddress) {
            console.log('IP changed, Updating Records');
            await changeResourceRecordSets(hostedZoneId, currentIpAddress, name);
        } else {
            console.log('No Ip Changes');
        }

    });

}

updateDNSRecords(records);
