import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { peerIdFromString } from "@libp2p/peer-id";
import { KadDHT } from "@libp2p/kad-dht";
import { GossipSub } from "@chainsafe/libp2p-gossipsub";
import { tcp } from "@libp2p/tcp";
import { create } from "domain";

async function createNode(bootstrapNodes = []) {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0"], // Listen on any available port
    },
    transports: [tcp()], // Use TCP transport
    dht: new KadDHT(), // Enable DHT for peer discovery
    pubsub: new GossipSub(), // Enable PubSub for messaging
    peerDiscovery:
      bootstrapNodes.length > 0
        ? {
            bootstrap: { list: bootstrapNodes }, // Use bootstrap nodes if available
          }
        : undefined,
  });

  await node.start();
  console.log(`Node started! Peer ID: ${node.peerId.toString()}`);
  return node;
}

async function publishPeer(node, topic) {
  const peerId = node.peerId.toString();
  await node.dht.put(Buffer.from(topic), Buffer.from(peerId));
  console.log(`Published Peer ID ${peerId} under topic ${topic}`);
}

async function findPeers(node, topic) {
  const peerIdBuffer = await node.dht.get(Buffer.from(topic));
  const peerId = peerIdBuffer.toString();
  console.log(`Discovered peer: ${peerId}`);
  return peerId;
}

async function connectToPeer(node, peerId) {
  await node.dial(peerId);
  console.log(`✅ Connected to peer ${peerId}`);
}

// Example Usage:
(async () => {
  const topic = "chat-room-123";

  // Start Peer A
  const peerA = await createNode();
  await publishPeer(peerA, topic);

  // Start Peer B (Assuming Peer A's address is known or bootstrapped)
  const peerB = await createNode([peerA.peerId.toString()]);
  const discoveredPeerId = await findPeers(peerB, topic);

  if (discoveredPeerId) {
    await connectToPeer(peerB, discoveredPeerId);
  }
})();

async function main() {
  const node = await createLibp2p({
    // libp2p nodes are started by default, pass false to override this
    start: false,
    addresses: {
      listen: ["/ip4/127.0.0.1/tcp/8000/ws"],
    },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
  });

  // start libp2p
  await node.start();
  console.log("libp2p has started");

  const listenAddresses = node.getMultiaddrs();
  console.log(
    "libp2p is listening on the following addresses: ",
    listenAddresses
  );

  // stop libp2p
  await node.stop();
  console.log("libp2p has stopped");

  const peer = peerIdFromString(
    "12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8"
  );

  // Convert the PeerID to a CID (Content Identifier)
  console.log(peer.toCID()); // CID(bafzaa...)

  // Convert the PeerID back to its string representation
  console.log(peer.toString()); // "12D3K..."
}

// main().catch(console.error);
createNode().catch(console.error);
