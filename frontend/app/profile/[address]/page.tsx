import type { Metadata } from "next";
import ProfilePageClient from "./profile-page-client";

function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

type RouteParams = { address: string };

type MetadataProps = {
  params: Promise<RouteParams> | RouteParams;
};

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const resolvedParams = await params;
  const address = resolvedParams.address;
  const isValidAddress = isValidStellarAddress(address);

  if (!isValidAddress) {
    return {
      title: "Profile | Invalid Address | StellarWork",
      description: "Invalid Stellar address supplied for profile lookup.",
    };
  }

  return {
    title: `Profile | ${address} | StellarWork`,
    description: `View on-chain profile activity for ${address}.`,
  };
}

type PageProps = {
  params: Promise<RouteParams> | RouteParams;
};

export default async function ProfilePage({ params }: PageProps) {
  const resolvedParams = await params;
  return <ProfilePageClient address={resolvedParams.address} />;
}
