const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

app.post('/identify', async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;

        if (!email && !phoneNumber) {
            return res.status(400).json({ error: 'At least one of email or phoneNumber is required' });
        }

        const orConditions = [];
        if (email) orConditions.push({ email });
        if (phoneNumber) orConditions.push({ phoneNumber: String(phoneNumber) });

        const directMatches = await prisma.contact.findMany({
            where: { OR: orConditions }
        });

        if (directMatches.length === 0) {
            const newContact = await prisma.contact.create({
                data: {
                    email: email || null,
                    phoneNumber: phoneNumber ? String(phoneNumber) : null,
                    linkPrecedence: 'primary'
                }
            });
            return res.status(200).json({
                contact: {
                    primaryContactId: newContact.id,
                    emails: newContact.email ? [newContact.email] : [],
                    phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                    secondaryContactIds: []
                }
            });
        }

        const primaryIdsToFetch = Array.from(new Set(
            directMatches.map(c => c.linkedId ? c.linkedId : c.id)
        ));

        const clusterContacts = await prisma.contact.findMany({
            where: {
                OR: [
                    { id: { in: primaryIdsToFetch } },
                    { linkedId: { in: primaryIdsToFetch } }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });

        const allPrimariesInCluster = clusterContacts.filter(c => c.linkPrecedence === 'primary');
        const truePrimary = allPrimariesInCluster[0] || clusterContacts[0];

        const otherPrimaries = allPrimariesInCluster.slice(1);
        if (otherPrimaries.length > 0) {
            const otherPrimaryIds = otherPrimaries.map(c => c.id);

            await prisma.contact.updateMany({
                where: { id: { in: otherPrimaryIds } },
                data: {
                    linkedId: truePrimary.id,
                    linkPrecedence: 'secondary',
                    updatedAt: new Date()
                }
            });

            await prisma.contact.updateMany({
                where: { linkedId: { in: otherPrimaryIds } },
                data: {
                    linkedId: truePrimary.id,
                    updatedAt: new Date()
                }
            });

            for (let c of clusterContacts) {
                if (otherPrimaryIds.includes(c.id)) {
                    c.linkedId = truePrimary.id;
                    c.linkPrecedence = 'secondary';
                } else if (c.linkedId && otherPrimaryIds.includes(c.linkedId)) {
                    c.linkedId = truePrimary.id;
                }
            }
        }

        const clusterEmails = new Set(clusterContacts.map(c => c.email).filter(Boolean));
        const clusterPhones = new Set(clusterContacts.map(c => c.phoneNumber).filter(Boolean));

        const isNewEmail = email && !clusterEmails.has(email);
        const isNewPhone = phoneNumber && !clusterPhones.has(String(phoneNumber));

        if (isNewEmail || isNewPhone) {
            const newSecondary = await prisma.contact.create({
                data: {
                    email: email || null,
                    phoneNumber: phoneNumber ? String(phoneNumber) : null,
                    linkedId: truePrimary.id,
                    linkPrecedence: 'secondary'
                }
            });
            clusterContacts.push(newSecondary);
        }

        const secondaryContacts = clusterContacts.filter(c => c.id !== truePrimary.id);

        const emails = [];
        if (truePrimary.email) emails.push(truePrimary.email);
        for (const c of secondaryContacts) {
            if (c.email && !emails.includes(c.email)) {
                emails.push(c.email);
            }
        }

        const phones = [];
        if (truePrimary.phoneNumber) phones.push(truePrimary.phoneNumber);
        for (const c of secondaryContacts) {
            if (c.phoneNumber && !phones.includes(c.phoneNumber)) {
                phones.push(c.phoneNumber);
            }
        }

        const secondaryContactIds = secondaryContacts.map(c => c.id);

        return res.status(200).json({
            contact: {
                primaryContactId: truePrimary.id,
                emails,
                phoneNumbers: phones,
                secondaryContactIds
            }
        });

    } catch (error) {
        console.error('Error in /identify:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
