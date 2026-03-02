import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

app.post('/identify', async (req: Request, res: Response): Promise<any> => {
    try {
        const { email, phoneNumber } = req.body;

        if (!email && !phoneNumber) {
            return res.status(400).json({ error: 'At least one of email or phoneNumber is required' });
        }

        // 1. Find all matching contacts
        const orConditions: any[] = [];
        if (email) orConditions.push({ email });
        if (phoneNumber) orConditions.push({ phoneNumber: String(phoneNumber) });

        const directMatches = await prisma.contact.findMany({
            where: { OR: orConditions }
        });

        // Rule A (New Customer): If query returns absolutely no matching rows
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

        // We have matches. Find all related "primary" IDs from these matches
        const primaryIdsToFetch = Array.from(new Set(
            directMatches.map(c => c.linkedId ? c.linkedId : c.id)
        ));

        // Fetch all contacts in the cluster (the primaries and all their secondaries)
        const clusterContacts = await prisma.contact.findMany({
            where: {
                OR: [
                    { id: { in: primaryIdsToFetch } },
                    { linkedId: { in: primaryIdsToFetch } }
                ]
            },
            orderBy: { createdAt: 'asc' } // oldest first
        });

        // Identify the true primary (the oldest primary in the cluster)
        const allPrimariesInCluster = clusterContacts.filter(c => c.linkPrecedence === 'primary');
        const truePrimary = allPrimariesInCluster[0] || clusterContacts[0]; // fallback if data is weird

        // Rule C: Merge other primaries into the true primary
        const otherPrimaries = allPrimariesInCluster.slice(1);
        if (otherPrimaries.length > 0) {
            const otherPrimaryIds = otherPrimaries.map(c => c.id);

            // Turn other primaries into secondaries of truePrimary
            await prisma.contact.updateMany({
                where: { id: { in: otherPrimaryIds } },
                data: {
                    linkedId: truePrimary.id,
                    linkPrecedence: 'secondary',
                    updatedAt: new Date()
                }
            });

            // Re-link any secondaries that belonged to the old primaries
            await prisma.contact.updateMany({
                where: { linkedId: { in: otherPrimaryIds } },
                data: {
                    linkedId: truePrimary.id,
                    updatedAt: new Date()
                }
            });

            // Update local memory representations to reflect db changes so we don't need to fetch again
            for (let c of clusterContacts) {
                if (otherPrimaryIds.includes(c.id)) {
                    c.linkedId = truePrimary.id;
                    c.linkPrecedence = 'secondary';
                } else if (c.linkedId && otherPrimaryIds.includes(c.linkedId)) {
                    c.linkedId = truePrimary.id;
                }
            }
        }

        // Rule B: Check if there's new info that requires creating a new Secondary contact
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

        // Format and return Response
        // Secondary contacts filter
        const secondaryContacts = clusterContacts.filter(c => c.id !== truePrimary.id);

        // Emails array: true primary first, then others, unique
        const emails: string[] = [];
        if (truePrimary.email) emails.push(truePrimary.email);
        for (const c of secondaryContacts) {
            if (c.email && !emails.includes(c.email)) {
                emails.push(c.email);
            }
        }

        // Phones array: true primary first, then others, unique
        const phones: string[] = [];
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
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
